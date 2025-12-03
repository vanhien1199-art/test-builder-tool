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

            // --- SỬ DỤNG GEMINI 2.0 FLASH (KHÔNG PHẢI EXP) ---
            // gemini-2.0-flash là phiên bản ổn định, hỗ trợ toàn cầu
            const MODEL_NAME = "gemini-2.0-flash"; 

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ 
                model: MODEL_NAME,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                }
            });

            const body = await request.json();
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics, exam_type, use_short_answer } = body;

            // --- KIỂM TRA LICENSE ---
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "MÃ LỖI HOẶC HẾT HẠN" }), { 
                        status: 403, 
                        headers: { ...corsHeaders, "Content-Type": "application/json" } 
                    });
                }
            }

            // Chuẩn bị dữ liệu Prompt
            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name} (Nội dung: ${t.content}, Tiết đầu: ${t.p1}, Tiết sau: ${t.p2})`;
            }).join("\n");

            // --- PROMPT TỐI ƯU CHO HTML OUTPUT ---
            const prompt = `Bạn là trợ lý tạo ma trận đề kiểm tra theo CV 7991 của Bộ GD&ĐT Việt Nam.

THÔNG TIN ĐẦU VÀO:
- Môn: ${subject} lớp ${grade}
- Học kì: ${semester === '1' ? 'Học kì 1' : 'Học kì 2'}
- Loại kiểm tra: ${exam_type === 'hk' ? 'Kiểm tra học kì' : 'Kiểm tra giữa kì'}
- Thời gian: ${time} phút
- Chủ đề: ${topics.length} chủ đề
- Chi tiết chủ đề: ${topicsDescription}

YÊU CẦU QUAN TRỌNG: Bạn PHẢI trả về nội dung dưới dạng HTML table, KHÔNG dùng markdown.

Tạo HTML cho 3 phần:

PHẦN 1: MA TRẬN ĐỀ KIỂM TRA (19 cột)
- Dùng <table border="1" style="border-collapse: collapse; width: 100%;">
- Header: dòng 1-4 với rowspan/colspan
- Cấu trúc 19 cột theo mẫu 7991
- Tổng điểm: 10 điểm
- Phân bổ: TNKQ 60-70%, TL 30-40%

PHẦN 2: BẢN ĐẶC TẢ (16 cột)
- Bảng HTML với đầy đủ rowspan/colspan
- Yêu cầu cần đạt cho từng chủ đề

PHẦN 3: ĐỀ KIỂM TRA MẪU
- Câu hỏi trắc nghiệm
- Câu hỏi tự luận
- Đáp án

CẤU TRÚC HTML MẪU:
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<h1 style="text-align: center;">MA TRẬN ĐỀ KIỂM TRA</h1>
<table border="1" style="border-collapse: collapse; width: 100%;">
<tr>
<th rowspan="4">TT</th>
<th rowspan="4">Chủ đề</th>
<th rowspan="4">Nội dung</th>
<th colspan="12">Mức độ đánh giá</th>
<th colspan="3">Tổng</th>
<th rowspan="4">Tỉ lệ %</th>
</tr>
<!-- Thêm các dòng khác -->
</table>
</body>
</html>

QUY TẮC:
1. Tổng điểm = 10 điểm
2. Tính toán phân bổ dựa trên số tiết nếu là đề học kì
3. Mỗi chủ đề có ít nhất 1 câu vận dụng
4. Ghi rõ "Theo Công văn 7991/BGDĐT-GDTrH"`;

            // --- GỌI GEMINI ---
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
                                if (current > 0) {
                                    await env.TEST_TOOL.put(license_key, (current - 1).toString());
                                }
                            }
                        }
                        controller.close();
                    } catch (streamError) {
                        console.error("Lỗi trong stream:", streamError);
                        controller.error(streamError);
                    }
                }
            });

            return new Response(readableStream, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache",
                }
            });

        } catch (error) {
            console.error("Lỗi API:", error);
            return new Response(JSON.stringify({ 
                error: `Lỗi: ${error.message}` 
            }), { 
                status: 500, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
    }
    
    return new Response(JSON.stringify({ error: "Method không hỗ trợ" }), { 
        status: 405, 
        headers: corsHeaders 
    });
}
