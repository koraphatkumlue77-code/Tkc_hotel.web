import { fileURLToPath } from "node:url";
import { pool, withTransaction } from "../server/db.js";
import { migrate } from "./migrate.js";
import { hashPassword } from "../server/auth.js";

const types = [
  [1, "Standard", "Std", 300, 2, 1000, 350],
  [2, "Superior", "Sup", 150, 3, 1500, 350],
  [3, "Deluxe", "Dlx", 250, 2, 2000, 350],
  [4, "Family", "Fam", 100, 6, 4500, 500],
];
const presentation = {
  1: [
    "พื้นที่พักผ่อนที่เรียบง่ายและสงบ พร้อมรายละเอียดที่ใส่ใจในทุกมุม",
    "/assets/room-standard.jpg",
  ],
  2: ["ห้องโปร่งสบายสำหรับการพักผ่อนที่มีพื้นที่มากขึ้น", "/assets/room-superior.jpg"],
  3: ["ห้องพักดีไซน์อบอุ่นเพื่อช่วงเวลาที่พิเศษ", "/assets/room-deluxe.jpg"],
  4: ["พื้นที่กว้างสำหรับครอบครัวและคนสำคัญ", "/assets/room-family.jpg"],
};

export async function seed() {
  await migrate();
  const demoHash = await hashPassword(
    process.env.DEMO_STAFF_PASSWORD || "TkcDemo2026!",
  );
  await withTransaction(async (connection) => {
    for (const [
      id,
      name,
      prefix,
      count,
      capacity,
      nightly,
      breakfast,
    ] of types) {
      await connection.execute(
        "INSERT INTO room_types (id, name, capacity, nightly_price, breakfast_price) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
        [id, name, capacity, nightly, breakfast],
      );
      await connection.execute(
        "UPDATE room_types SET description=COALESCE(description,?),image_url=COALESCE(image_url,?) WHERE id=?",
        [...presentation[id], id],
      );
      for (let n = 1; n <= count; n++) {
        const code = `${prefix}${String(n).padStart(3, "0")}`;
        await connection.execute(
          "INSERT IGNORE INTO rooms (type_id, code, status) VALUES (?, ?, ?)",
          [id, code, "ready"],
        );
      }
    }
    for (const role of [
      "superadmin",
      "reception",
      "accounting",
      "management",
      "housekeeping",
    ]) {
      const name =
        role === "reception"
          ? "Front Desk"
          : role[0].toUpperCase() + role.slice(1);
      await connection.execute(
        "INSERT IGNORE INTO departments (name) VALUES (?)",
        [name],
      );
      const [[department]] = await connection.execute(
        "SELECT id FROM departments WHERE name=?",
        [name],
      );
      await connection.execute(
        "INSERT IGNORE INTO accounts (department_id,email,password_hash,role) VALUES (?,?,?,?)",
        [department.id, `${role}@tkc.local`, demoHash, role],
      );
    }
    const [[attractions]] = await connection.query(
      "SELECT COUNT(*) AS amount FROM attractions",
    );
    if (!attractions.amount) {
      await connection.execute(
        "INSERT INTO attractions (name,description,season,visible) VALUES (?,?,?,1)",
        ["เส้นทางริมทะเล", "เดินเล่นรับลมและแสงเย็นในช่วงปลายวัน", "summer"],
      );
      await connection.execute(
        "INSERT INTO attractions (name,description,season,visible) VALUES (?,?,?,1)",
        ["ตลาดกลางคืน", "สัมผัสรสชาติและบรรยากาศท้องถิ่นหลังพระอาทิตย์ตก", "all"],
      );
    }
    // These illustrative seasonal destinations belong to the fictional hotel's demo content.
    for (const [name, description, season, image] of [
      [
        "เส้นทางธรรมชาติหลังฝน",
        "ตัวอย่างเส้นทางพักผ่อนท่ามกลางต้นไม้เขียวชอุ่ม ตรวจสอบสภาพอากาศและเส้นทางกับฝ่ายต้อนรับก่อนเดินทาง",
        "rainy",
        "/assets/season-rainy.jpg",
      ],
      [
        "จุดชมวิวรับลมหนาว",
        "ตัวอย่างจุดชมวิวสำหรับวันอากาศเย็น วางแผนเวลาเดินทางและสอบถามรายละเอียดกับฝ่ายต้อนรับ",
        "winter",
        "/assets/season-winter.jpg",
      ],
      [
        "อ่าวน้ำใส",
        "เส้นทางตัวอย่างสำหรับเดินเล่นริมอ่าว รับลมทะเลและพักผ่อนในวันที่อากาศแจ่มใส สอบถามสภาพอากาศกับฝ่ายต้อนรับก่อนออกเดินทาง",
        "summer",
        "/assets/season-bay.jpg",
      ],
      [
        "เกาะและโลกใต้ทะเล",
        "ไอเดียทริปชมเกาะและกิจกรรมทางทะเลในฤดูร้อน ตรวจสอบรอบเดินทาง อุปกรณ์ และความเหมาะสมของสภาพคลื่นก่อนจอง",
        "summer",
        "/assets/season-island.jpg",
      ],
      [
        "น้ำตกกลางป่า",
        "ตัวอย่างเส้นทางรับความสดชื่นท่ามกลางสายน้ำในฤดูฝน ควรตรวจสอบประกาศเปิดเส้นทางและเดินทางกับผู้ดูแลพื้นที่",
        "rainy",
        "/assets/season-waterfall.jpg",
      ],
      [
        "สวนพฤกษชาติ",
        "ไอเดียเดินชมพรรณไม้และมุมถ่ายภาพสีเขียวหลังฝน เลือกวันเดินทางที่เหมาะสมและเตรียมรองเท้าสำหรับเดินชมธรรมชาติ",
        "rainy",
        "/assets/season-garden.jpg",
      ],
      [
        "ทะเลหมอกยามเช้า",
        "ตัวอย่างจุดชมบรรยากาศหมอกในฤดูหนาว เตรียมเสื้อกันหนาวและสอบถามเวลาออกเดินทางกับฝ่ายต้อนรับ",
        "winter",
        "/assets/season-mist.jpg",
      ],
      [
        "ทะเลสาบกลางหุบเขา",
        "เส้นทางตัวอย่างสำหรับพักสายตาท่ามกลางผืนน้ำและวิวภูเขา เหมาะกับการวางแผนพักผ่อนในวันอากาศเย็น",
        "winter",
        "/assets/season-lake.jpg",
      ],
    ]) {
      const [[existing]] = await connection.execute(
        "SELECT id FROM attractions WHERE name=? LIMIT 1",
        [name],
      );
      if (!existing)
        await connection.execute(
          "INSERT INTO attractions (name,description,season,image_url,visible) VALUES (?,?,?,?,1)",
          [name, description, season, image],
        );
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed().then(
    () => pool.end(),
    (error) => {
      console.error(error);
      process.exitCode = 1;
      pool.end();
    },
  );
}
