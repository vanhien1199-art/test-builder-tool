// File: functions/api_matrix.js
export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    try {
        const apiKey = env.GOOGLE_API_KEY;
        // Dùng bản Flash cho nhanh và ổn định
        const MODEL_NAME = "gemini-2.0-flash"; 
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const body = await request.json();
        const { topics } = body;

        let topicsDescription = topics.map((t, index) => 
            `Chủ đề ${index + 1}: ${t.name} (${t.content})`
        ).join("\n");
       
        const prompt = `
        Bạn là chuyên gia soạn đề thi. 
        Nội dung yêu cầu: ${topicsDescription}

        YÊU CẦU ĐỊNH DẠNG HTML (QUAN TRỌNG ĐỂ XUẤT WORD):
        1. Chỉ trả về mã HTML bảng: <table>...</table>.
        2. Bảng border="1".
        3. CÔNG THỨC TOÁN (MATHML):
           - Bắt buộc dùng MathML chuẩn (<math>, <msqrt>, <msup>, <mfrac>).
           - KHÔNG dùng LaTeX.
           - KHÔNG tự thêm "mml:" (Hệ thống sẽ tự thêm sau).
           - **QUAN TRỌNG:** Viết liền mạch, KHÔNG xuống dòng trong thẻ toán.
             Đúng: <math><msqrt><mn>5</mn></msqrt></math>
             Sai: 
             <math>
               <msqrt>
                 <mn>5</mn>
               </msqrt>
             </math>
        4. Căn bậc 2 dùng <msqrt>, Căn bậc 3 dùng <mroot>.
        5. Phân số dùng <mfrac>.
        `;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        // Xử lý stream như cũ
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        (async () => {
            const reader = response.body.getReader();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const jsonStr = line.substring(6).trim();
                            if (jsonStr === "[DONE]") continue;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (text) await writer.write(encoder.encode(text));
                            } catch (e) {}
                        }
                    }
                }
            } catch (err) {
                await writer.write(encoder.encode("Error: " + err.message));
            } finally {
                await writer.close();
            }
        })();

        return new Response(readable, { headers: { ...corsHeaders, "Content-Type": "text/html" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}
