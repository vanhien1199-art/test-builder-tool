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

            // --- KIỂM TRA DỮ LIỆU ĐẦU VÀO ---
            if (!subject || !grade || !topics || topics.length === 0) {
                return new Response(JSON.stringify({ error: "Thiếu dữ liệu đầu vào" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Chuẩn bị dữ liệu Prompt
            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name} (Nội dung: ${t.content}, Tiết đầu: ${t.p1}, Tiết sau: ${t.p2})`;
            }).join("\n");

            console.log("Đang gọi Gemini với model:", MODEL_NAME);
            console.log("Số chủ đề:", topics.length);
            
            // --- PROMPT TỐI ƯU CHO HTML OUTPUT ---
            const prompt = `[QUAN TRỌNG: TRẢ VỀ HTML, KHÔNG MARKDOWN]

Bạn là trợ lý tạo ma trận đề kiểm tra theo CV 7991.

THÔNG TIN ĐẦU VÀO:
- Môn: ${subject} lớp ${grade}
- Học kì: ${semester === '1' ? 'Học kì 1' : 'Học kì 2'}
- Loại kiểm tra: ${exam_type === 'hk' ? 'Kiểm tra học kì' : 'Kiểm tra giữa kì'}
- Thời gian: ${time} phút
- Chủ đề: ${topics.length} chủ đề
- Chi tiết chủ đề: ${topicsDescription}

YÊU CẦU:
Tạo HTML cho 3 phần sau:

PHẦN 1: MA TRẬN ĐỀ KIỂM TRA (19 cột)
- Dùng <table border="1">
- Header: dòng 1-4 với rowspan/colspan
- Nội dung: từ dòng 5, liệt kê các chủ đề
- Tổng điểm: 10 điểm
- Phân bổ: TNKQ 60-70%, TL 30-40%

PHẦN 2: BẢN ĐẶC TẢ (16 cột)
- Bảng HTML với đầy đủ rowspan/colspan
- Yêu cầu cần đạt cho từng chủ đề

PHẦN 3: ĐỀ KIỂM TRA MẪU
- Câu hỏi trắc nghiệm (nhiều lựa chọn, đúng-sai)
- Câu hỏi tự luận
- Đáp án

ĐỊNH DẠNG HTML BẮT BUỘC:
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<h1>MA TRẬN ĐỀ KIỂM TRA</h1>
<!-- Bảng HTML tại đây -->
</body>
</html>

LƯU Ý: Chỉ trả về HTML, không giải thích thêm.`;

            // --- THỬ GỌI GEMINI VÀ XỬ LÝ LỖI CHI TIẾT ---
            try {
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
                                        console.log("Đã trừ 1 credit, còn lại:", current - 1);
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

            } catch (geminiError) {
                console.error("Lỗi khi gọi Gemini:", geminiError);
                
                // Kiểm tra xem model có khả dụng không
                if (geminiError.message && geminiError.message.includes("location is not supported")) {
                    return new Response(JSON.stringify({ 
                        error: "Model gemini-2.0-flash-exp không khả dụng ở khu vực của bạn. Vui lòng đổi sang gemini-1.5-flash." 
                    }), { 
                        status: 400, 
                        headers: { ...corsHeaders, "Content-Type": "application/json" } 
                    });
                }
                
                throw geminiError;
            }

        } catch (error) {
            console.error("Lỗi tổng quan:", error);
            return new Response(JSON.stringify({ 
                error: `Lỗi AI: ${error.message}` 
            }), { 
                status: 500, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
    }
    
    // Nếu không phải POST
    return new Response(JSON.stringify({ error: "Method không hỗ trợ" }), { 
        status: 405, 
        headers: corsHeaders 
    });
}
