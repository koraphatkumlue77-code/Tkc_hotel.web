import { api } from "./api.js";
import { baht, node, setupNav, setupDateInputs, errorBlock } from "./ui.js";
setupNav();
setupDateInputs(
  document.querySelector("#checkIn"),
  document.querySelector("#checkOut"),
);

async function loadRooms() {
  const target = document.querySelector("#featuredRooms");
  try {
    const rooms = (await api("/api/rooms/types")).slice(0, 3);
    target.replaceChildren(
      ...rooms.map((room) => {
        const card = node("article", "", "room-card");
        const image = document.createElement("img");
        image.src = room.imageUrl || "/assets/room-standard.jpg";
        image.alt = `ตัวอย่างห้อง ${room.name}`;
        image.loading = "lazy";
        const body = node("div", "", "body");
        body.append(
          node(
            "span",
            `ROOM 0${room.id} · พักได้สูงสุด ${room.capacity} ท่าน`,
            "eyebrow",
          ),
          node("h3", room.name, "serif"),
          node("p", room.description || "พื้นที่พักผ่อนที่ออกแบบอย่างใส่ใจ", "subtle"),
        );
        const foot = node("div", "", "foot");
        foot.append(
          node("span", `เริ่ม ${baht(room.nightlyPrice)} / คืน`, "price"),
        );
        const link = node("a", "ดูห้องพัก ↗", "text-link");
        link.href = `/rooms.html?typeId=${room.id}`;
        foot.append(link);
        body.append(foot);
        card.append(image, body);
        return card;
      }),
    );
  } catch (error) {
    errorBlock(target, error.message, loadRooms);
  }
}
async function loadExtras() {
  try {
    const [reviews, attractions] = await Promise.all([
      api("/api/reviews"),
      api("/api/attractions"),
    ]);
    if (reviews.length) {
      const target = document.querySelector("#reviewPreview");
      target.replaceChildren();
      target.append(
        node("blockquote", `“${reviews[0].content}”`),
        node(
          "span",
          `${reviews[0].reviewerName} · ${"★".repeat(reviews[0].rating)}`,
          "small",
        ),
      );
    }
    const target = document.querySelector("#attractionPreview");
    target.replaceChildren(
      ...attractions.slice(0, 2).map((item) => {
        const box = node("article", "", "experience-card");
        box.append(
          node("span", item.season.toUpperCase(), "eyebrow"),
          node("h3", item.name, "serif"),
          node("p", item.description, "subtle"),
        );
        return box;
      }),
    );
  } catch {
    document
      .querySelector("#attractionPreview")
      .replaceChildren(node("p", "ข้อมูลสถานที่ยังไม่พร้อม", "subtle"));
  }
}
loadRooms();
loadExtras();
