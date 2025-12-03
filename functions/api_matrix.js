// File: functions/api_matrix.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Xử lý Preflight request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Xử lý POST request
    if (request.method === "POST") {
        try {
            const apiKey = env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("Thiếu API Key");

            // --- CẤU HÌNH MODEL: GEMINI 1.5 FLASH ---
            const MODEL_NAME = "gemini-1.5-flash"; 

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const body = await request.json();
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics, exam_type, use_short_answer } = body;

            // KIỂM TRA LICENSE (Nếu có dùng KV)
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "MÃ LỖI HOẶC HẾT HẠN" }), { status: 403, headers: corsHeaders });
                }
            }

            // Chuẩn bị dữ liệu Prompt
            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name} (Nội dung: ${t.content}, Tiết đầu: ${t.p1}, Tiết sau: ${t.p2})`;
            }).join("\n");

            // --- PROMPT ---
            const prompt = `
            Bạn là chuyên gia khảo thí. Hãy xây dựng bộ tài liệu kiểm tra theo Công văn 7991/BGDĐT-GDTrH.

            THÔNG TIN ĐẦU VÀO:
            - Môn: ${subject} lớp ${grade}
            - Học kì: ${semester} (${exam_type === 'hk' ? 'Cuối kì' : 'Giữa kì'})
            - Thời gian: ${time} phút
            - Sử dụng câu hỏi Trả lời ngắn: ${use_short_answer ? 'Có' : 'Không'}
            - Tổng tiết: ${totalPeriodsHalf1} (Nửa đầu) + ${totalPeriodsHalf2} (Nửa sau)
            - Nội dung chi tiết:
            ${topicsDescription}

            NHIỆM VỤ:
            1. Tính trọng số điểm (Nửa đầu 25%, Nửa sau 75% cho đề Học kì).
            2. Tạo 4 phần nội dung chuẩn xác.

            QUY ĐỊNH ĐỊNH DẠNG OUTPUT (BẮT BUỘC):
            - KHÔNG sử dụng Markdown (không dùng dấu |).
            - Trả về mã **HTML THUẦN** cho các bảng.
            - Sử dụng thẻ <table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse; width:100%;">.
            - Sử dụng chính xác rowspan và colspan để gộp ô.

            HÃY XUẤT RA HTML THEO CẤU TRÚC SAU:

            <h3>PHẦN 1. MA TRẬN ĐỀ KIỂM TRA</h3>
            <table>
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề/Chương</th>
                        <th rowspan="4">Nội dung/đơn vị kiến thức</th>
                        <th colspan="12">Mức độ đánh giá</th>
                        <th colspan="3">Tổng</th>
                        <th rowspan="4">Tỉ lệ %</th>
                    </tr>
                    <tr>
                        <th colspan="9">TNKQ</th>
                        <th colspan="3">Tự luận</th>
                        <th rowspan="3">Số câu</th>
                        <th rowspan="3">Điểm</th>
                        <th rowspan="3">%</th>
                    </tr>
                    <tr>
                        <th colspan="3">Nhiều lựa chọn</th>
                        <th colspan="3">Đúng - Sai</th>
                        <th colspan="3">Trả lời ngắn</th>
                        <th colspan="3">TL (Tự luận)</th>
                    </tr>
                    <tr>
                        <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
                        <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
                        <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
                        <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
                    </tr>
                </thead>
                <tbody>
                    </tbody>
            </table>

            <h3>PHẦN 2. BẢN ĐẶC TẢ</h3>
            <table>
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề</th>
                        <th rowspan="4">Nội dung</th>
                        <th rowspan="4">Yêu cầu cần đạt</th>
                        <th colspan="12">Số câu hỏi ở các mức độ</th>
                    </tr>
                    <tr>
                        <th colspan="9">TNKQ</th>
                        <th colspan="3">Tự luận</th>
                    </tr>
                    <tr>
                        <th colspan="3">Nhiều lựa chọn</th>
                        <th colspan="3">Đúng - Sai</th>
                        <th colspan="3">Trả lời ngắn</th>
                        <th colspan="3">Tự luận</th>
                    </tr>
                    <tr>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                    </tr>
                </thead>
                <tbody>
                    </tbody>
            </table>

            <h3>PHẦN 3. ĐỀ KIỂM TRA (ĐỀ MINH HỌA)</h3>
            <div style="font-family: 'Times New Roman';">
                <b>I. TRẮC NGHIỆM</b><br>
                <b>II. TỰ LUẬN</b><br>
                </div>

            <h3>PHẦN 4. HƯỚNG DẪN CHẤM</h3>
            Lưu ý: Chỉ trả về mã HTML, không bọc trong \`\`\`html.
            `;

            // STREAMING
            const { stream } = await model.generateContentStream(prompt);

            const readableStream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const chunkText = chunk.text();
                            controller.enqueue(new TextEncoder().encode(chunkText));
                        }
                        // Trừ tiền
                        if (env.TEST_TOOL && license_key) {
                            const creditStr = await env.TEST_TOOL.get(license_key);
                            if (creditStr) {
                                let current = parseInt(creditStr);
                                if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                            }
                        }
                        controller.close();
                    } catch (e) {
                        controller.error(e);
                    }
                }
            });

            return new Response(readableStream, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8", 
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `Lỗi AI: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
    
    // Fallback response nếu không phải POST/OPTIONS
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}
