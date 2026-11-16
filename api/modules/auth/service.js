import bcrypt from "bcryptjs";

import { ApiError } from "../../middleware/errors.js";
import {
  normalizeEmail,
  requireEmail,
  requireObject,
  requireString
} from "../../middleware/validation.js";

const EMPLOYEE_ROLES = new Map([
  ["reception", "reception"],
  ["receptionist", "reception"],
  ["front_office", "reception"],
  ["accounting", "accounting"],
  ["accountant", "accounting"],
  ["housekeeping", "housekeeping"],
  ["housekeeper", "housekeeping"],
  ["superadmin", "superadmin"],
  ["super_admin", "superadmin"],
  ["management", "management"],
  ["manager", "management"]
]);

const DUMMY_PASSWORD_HASH = "$2b$12$1vU8bCahi6p5uGg85/6s0O/B0ImbyTtT7yg8BgM9ph2QLEgCGzmn6";

export class AuthService {
  constructor(repository, { bcryptCost = 12 } = {}) {
    this.repository = repository;
    this.bcryptCost = bcryptCost;
  }

  async register(body) {
    const input = validateRegistration(body);
    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost);
    try {
      const principal = await this.repository.createCustomer({ ...input, passwordHash });
      return toPublicPrincipal(principal);
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "EMAIL_IN_USE", "Email is already registered");
      }
      throw error;
    }
  }

  async login(body) {
    const input = validateLogin(body);
    const record = input.accountType === "customer"
      ? await this.repository.findCustomerByEmail(input.email)
      : await this.repository.findEmployeeByEmail(input.email);

    const passwordMatches = await bcrypt.compare(
      input.password,
      record?.passwordHash || DUMMY_PASSWORD_HASH
    );
    if (!record || !passwordMatches) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    const principal = activePrincipal(record);
    await this.repository.recordLogin(principal);
    return principal;
  }

  async loadPrincipal(type, id) {
    const record = type === "customer"
      ? await this.repository.findCustomerById(id)
      : type === "employee"
        ? await this.repository.findEmployeeById(id)
        : null;
    if (!record) return null;
    try {
      return activePrincipal(record);
    } catch {
      return null;
    }
  }

  async updateProfile(body, principal) {
    requireCustomer(principal);
    const value = requireObject(body);
    const record = await this.repository.updateCustomerProfile(principal.id, {
      fullName: requireString("full_name", value.full_name, { max: 150 }),
      phone: requireString("phone", value.phone, { max: 20 })
    });
    return toPublicPrincipal(record);
  }

  async changePassword(body, principal) {
    requireCustomer(principal);
    const value = requireObject(body);
    const currentPassword = requireString("current_password", value.current_password, { max: 128 });
    const newPassword = validatePassword("new_password", value.new_password);
    const record = await this.repository.findCustomerById(principal.id);
    if (!record || !await bcrypt.compare(currentPassword, record.passwordHash)) {
      throw new ApiError(401, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
    }
    if (await bcrypt.compare(newPassword, record.passwordHash)) {
      throw new ApiError(400, "PASSWORD_UNCHANGED", "New password must be different");
    }
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptCost);
    await this.repository.updateCustomerPassword(principal.id, passwordHash);
  }
}

export function normalizeEmployeeRole(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return EMPLOYEE_ROLES.get(normalized) ?? null;
}

function activePrincipal(record) {
  if (!Boolean(record.active)) {
    throw new ApiError(403, "ACCOUNT_INACTIVE", "Account is inactive");
  }
  if (record.type === "customer" && record.memberStatus !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_INACTIVE", "Customer membership is inactive");
  }
  if (record.type === "employee" && !normalizeEmployeeRole(record.roleName)) {
    throw new ApiError(403, "ROLE_NOT_SUPPORTED", "Employee role is not supported");
  }
  return toPublicPrincipal(record);
}

export function toPublicPrincipal(record) {
  const principal = {
    id: Number(record.id),
    type: record.type,
    role: record.type === "customer" ? "customer" : normalizeEmployeeRole(record.roleName),
    email: record.email
  };
  if (record.type === "customer") {
    Object.assign(principal, {
      fullName: record.fullName,
      phone: record.phone,
      identityType: record.identityType,
      identityNumber: record.identityNumber,
      memberStatus: record.memberStatus,
      registeredAt: record.registeredAt
    });
  } else {
    Object.assign(principal, {
      name: record.name,
      departmentName: record.departmentName
    });
  }
  return principal;
}

function validateRegistration(body) {
  const value = requireObject(body);
  const password = validatePassword("password", value.password);
  return {
    fullName: requireString("full_name", value.full_name, { max: 150 }),
    email: requireEmail("email", value.email),
    phone: requireString("phone", value.phone, { max: 20 }),
    identityType: requireString("identity_type", value.identity_type, { max: 20 }),
    identityNumber: requireString("identity_number", value.identity_number, { max: 30 }),
    password
  };
}

function validatePassword(field, rawValue) {
  const password = requireString(field, rawValue, { min: 12, max: 128 });
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
      fields: { [field]: "Must include a letter and a number" }
    });
  }
  return password;
}

function requireCustomer(principal) {
  if (principal?.type !== "customer") {
    throw new ApiError(403, "CUSTOMER_REQUIRED", "A customer account is required");
  }
}

function validateLogin(body) {
  const value = requireObject(body);
  const accountType = requireString("account_type", value.account_type, { max: 20 }).toLowerCase();
  if (!["customer", "employee"].includes(accountType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
      fields: { account_type: "Must be customer or employee" }
    });
  }
  return {
    accountType,
    email: normalizeEmail(requireEmail("email", value.email)),
    password: requireString("password", value.password, { max: 128 })
  };
}
