export class AuthRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createCustomer(data) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO Customer
           (full_name, email, phone, identity_type, identity_number,
            password_hash, member_status, registered_at, active)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, TRUE)`,
        [
          data.fullName,
          data.email,
          data.phone,
          data.identityType,
          data.identityNumber,
          data.passwordHash
        ]
      );
      const principal = await this.findCustomerById(result.insertId, connection);
      await writeAudit(connection, {
        entityType: "Customer",
        entityId: result.insertId,
        action: "REGISTER",
        actor: { type: "customer", id: result.insertId },
        after: publicPrincipal(principal)
      });
      await connection.commit();
      return principal;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findCustomerByEmail(email) {
    const [rows] = await this.pool.execute(
      `${CUSTOMER_SELECT} WHERE email = ? LIMIT 1`,
      [email]
    );
    return rows[0] ?? null;
  }

  async findEmployeeByEmail(email) {
    const [rows] = await this.pool.execute(
      `${EMPLOYEE_SELECT} WHERE email = ? LIMIT 1`,
      [email]
    );
    return rows[0] ?? null;
  }

  async findCustomerById(id, executor = this.pool) {
    const [rows] = await executor.execute(
      `${CUSTOMER_SELECT} WHERE customer_id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findEmployeeById(id) {
    const [rows] = await this.pool.execute(
      `${EMPLOYEE_SELECT} WHERE employee_id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async updateCustomerProfile(id, data) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const before = await this.findCustomerById(id, connection);
      await connection.execute(
        "UPDATE Customer SET full_name = ?, phone = ? WHERE customer_id = ?",
        [data.fullName, data.phone, id]
      );
      const after = await this.findCustomerById(id, connection);
      await writeAudit(connection, {
        entityType: "Customer",
        entityId: id,
        action: "PROFILE_UPDATE",
        actor: { type: "customer", id },
        before: publicPrincipal(before),
        after: publicPrincipal(after)
      });
      await connection.commit();
      return after;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateCustomerPassword(id, passwordHash) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "UPDATE Customer SET password_hash = ? WHERE customer_id = ?",
        [passwordHash, id]
      );
      await writeAudit(connection, {
        entityType: "Customer",
        entityId: id,
        action: "PASSWORD_CHANGE",
        actor: { type: "customer", id }
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordLogin(principal) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (principal.type === "customer") {
        await connection.execute(
          "UPDATE Customer SET last_login_at = CURRENT_TIMESTAMP WHERE customer_id = ?",
          [principal.id]
        );
      }
      await writeAudit(connection, {
        entityType: principal.type === "customer" ? "Customer" : "Employee",
        entityId: principal.id,
        action: "LOGIN",
        actor: { type: principal.type, id: principal.id },
        after: { type: principal.type, id: principal.id, email: principal.email }
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

const CUSTOMER_SELECT = `
  SELECT customer_id AS id, 'customer' AS type, full_name AS fullName,
         email, phone, identity_type AS identityType,
         identity_number AS identityNumber, password_hash AS passwordHash,
         member_status AS memberStatus, registered_at AS registeredAt, active
  FROM Customer`;

const EMPLOYEE_SELECT = `
  SELECT employee_id AS id, 'employee' AS type, name,
         email, department_name AS departmentName, role_name AS roleName,
         password_hash AS passwordHash, active
  FROM Employee`;

export async function writeAudit(executor, event) {
  const actorType = event.actor?.type?.toUpperCase() || "SYSTEM";
  const customerId = actorType === "CUSTOMER" ? event.actor.id : null;
  const employeeId = actorType === "EMPLOYEE" ? event.actor.id : null;
  await executor.execute(
    `INSERT INTO AuditLog
       (entity_type, entity_id, action, actor_type,
        actor_customer_id, actor_employee_id, before_data, after_data, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.entityType,
      event.entityId,
      event.action,
      actorType,
      customerId,
      employeeId,
      jsonOrNull(event.before),
      jsonOrNull(event.after),
      event.reason ?? null
    ]
  );
}

function jsonOrNull(value) {
  return value === undefined || value === null
    ? null
    : JSON.stringify(sanitizeAuditData(value));
}

export function sanitizeAuditData(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (value instanceof Error) return {};
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(password|hash|token|cookie|secret|message|details|stack|sql|errno|sqlstate)/i.test(key))
      .map(([key, item]) => [key, sanitizeAuditData(item)])
  );
}

function publicPrincipal(principal) {
  const { passwordHash: _passwordHash, ...safe } = principal;
  return safe;
}
