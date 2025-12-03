// File: functions/api_matrix.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function onRequest(context) {
    const { request, env } = context;
    
    // Cấu hình CORS
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method === "POST") {
        try {
            const apiKey = env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("Thiếu API Key");

            // --- CẤU HÌNH MODEL GEMINI 2.0 (MỚI NHẤT) ---
            const MODEL_NAME = "gemini-2.0-flash-exp";

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const body = await request.json();
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics, exam_type, use_short_answer } = body;

            // --- KIỂM TRA LICENSE ---
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

            // --- PROMPT CẬP NHẬT: YÊU CẦU HTML TABLE ---
            const prompt = `
Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam.

## YÊU CẦU QUAN TRỌNG:
Bạn PHẢI trả về nội dung dưới dạng HTML với đầy đủ thẻ <table>, <tr>, <td>, <th> và sử dụng rowspan, colspan để merge ô theo đúng mẫu 7991.
KHÔNG sử dụng markdown table. CHỈ sử dụng HTML table.

## THÔNG TIN ĐẦU VÀO:
- Môn: ${subject} lớp ${grade}
- Học kì: ${semester}
- Loại kiểm tra: ${exam_type === 'hk' ? 'Kiểm tra học kì' : 'Kiểm tra định kì giữa kì'}
- Thời lượng: ${time} phút
- Sử dụng câu hỏi ngắn: ${use_short_answer ? 'Có' : 'Không'}
- Chủ đề: ${topicsDescription}

## ĐẦU RA PHẢI BAO GỒM 3 PHẦN DƯỚI DẠNG HTML:

### PHẦN 1: MA TRẬN ĐỀ KIỂM TRA (HTML TABLE - 19 cột)
Tạo bảng HTML với cấu trúc CHÍNH XÁC sau:
1. Dùng <table border="1"> với đầy đủ border
2. Hàng 1-4: Header với các ô gộp dùng rowspan và colspan
3. Ví dụ: <th rowspan="4">TT</th>, <th colspan="12">Mức độ đánh giá</th>
4. Từ hàng 5: Nội dung các chủ đề
5. Các dòng cuối: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %"

### PHẦN 2: BẢN ĐẶC TẢ (HTML TABLE - 16 cột)
Tạo bảng HTML với:
1. Cột 1-4: TT, Chủ đề, Nội dung, Yêu cầu cần đạt
2. Cột 5-16: Phân bổ câu hỏi theo mức độ và hình thức
3. Dùng rowspan/colspan cho header

### PHẦN 3: ĐỀ KIỂM TRA MẪU
Tạo đề kiểm tra hoàn chỉnh dạng HTML:
1. Phần trắc nghiệm (60-70%)
2. Phần tự luận (30-40%)
3. Đáp án và hướng dẫn chấm

## CẤU TRÚC HTML BẮT BUỘC:
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ma trận đề kiểm tra</title>
</head>
<body>
    <h1>BỘ GIÁO DỤC VÀ ĐÀO TẠO</h1>
    <h2>Theo Công văn 7991/BGDĐT-GDTrH</h2>
    
    <!-- PHẦN 1: MA TRẬN -->
    <h3>PHẦN 1: MA TRẬN ĐỀ KIỂM TRA</h3>
    <table border="1" style="border-collapse: collapse; width: 100%;">
        <!-- Cấu trúc 19 cột với rowspan/colspan -->
        <tr>
            <th rowspan="4">TT</th>
            <th rowspan="4">Chủ đề/Chương</th>
            <th rowspan="4">Nội dung/đơn vị kiến thức</th>
            <th colspan="12">Mức độ đánh giá</th>
            <th colspan="3">Tổng</th>
            <th rowspan="4">Tỉ lệ % điểm</th>
        </tr>
        <!-- ... tiếp tục theo mẫu 7991 ... -->
    </table>
    
    <!-- PHẦN 2: BẢN ĐẶC TẢ -->
    <h3>PHẦN 2: BẢN ĐẶC TẢ ĐỀ KIỂM TRA</h3>
    <table border="1" style="border-collapse: collapse; width: 100%;">
        <!-- Cấu trúc 16 cột với rowspan/colspan -->
    </table>
    
    <!-- PHẦN 3: ĐỀ MẪU -->
    <h3>PHẦN 3: ĐỀ KIỂM TRA MẪU</h3>
    <!-- Nội dung đề -->
</body>
</html>

## QUY TẮC PHÂN BỔ:
1. Tổng điểm = 10 điểm
2. Phân bổ: TNKQ (60-70%), Tự luận (30-40%)
3. Mức độ: Biết (30-40%), Hiểu (30-40%), Vận dụng (20-30%)
4. Nếu là đề học kì: 25% nửa đầu + 75% nửa sau
5. Mỗi câu TNKQ: 0.25-0.5 điểm, Tự luận: 1.0-2.0 điểm

## LƯU Ý CUỐI:
1. DÙNG HTML THUẦN, KHÔNG MARKDOWN
2. Dùng thẻ table với border="1"
3. Dùng rowspan và colspan chính xác
4. Ngôn ngữ: Tiếng Việt
5. Ghi rõ: "Theo Công văn 7991/BGDĐT-GDTrH"
`;

            // --- STREAMING ---
            const { stream } = await model.generateContentStream(prompt);

            const readableStream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const chunkText = chunk.text();
                            controller.enqueue(new TextEncoder().encode(chunkText));
                        }
                        // Trừ tiền khi hoàn tất
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
                    "Content-Type": "text/html; charset=utf-8", // Đổi thành HTML
                    "Cache-Control": "no-cache",
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ 
                error: `Lỗi AI (${error.message}). Hãy kiểm tra API Key.` 
            }), { status: 500, headers: corsHeaders });
        }
    }
}
