// File: public/js/app.js
// Phiên bản: STREAMING + ADD ROW FIX (Sửa lỗi không thêm được chủ đề)

// Biến toàn cục
var window.generatedHTML = ""; // Lưu HTML cho việc tải Word

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- SYSTEM READY: ADD ROW FIX VERSION ---");
    
    // Đảm bảo event listener chạy đúng
    document.getElementById('btnAddTopic').addEventListener('click', addTopicRow);
    document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
    document.getElementById('btnDownloadWord').addEventListener('click', handleDownloadWord);
    
    // Xử lý ẩn/hiện cột số tiết khi chọn loại đề (Event này đã có từ trước)
    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            // Duyệt qua tất cả các dòng hiện tại và ẩn/hiện cột số tiết
            document.querySelectorAll('.hk-only').forEach(el => {
                el.style.display = isHK ? 'block' : 'none';
            });
        });
        // Gọi lần đầu tiên để thiết lập trạng thái ban đầu (giữa kì/học kì)
        examTypeSelect.dispatchEvent(new Event('change'));
    }

    // Tự động thêm dòng chủ đề đầu tiên
    addTopicRow(); 
});

// --- HÀM THÊM CHỦ ĐỀ (ĐÃ FIX LỖI SILENT FAILURE) ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    
    // Lỗi: Bắt lỗi nếu Template/Container bị thiếu (Lý do code bị treo)
    if (!container) {
        console.error("❌ FATAL: Không tìm thấy ID='topics-container'");
        return;
    }
    if (!template) {
        console.error("❌ FATAL: Không tìm thấy ID='topic-template'. Vui lòng kiểm tra lại HTML.");
        return;
    }

    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Kích hoạt lại event change để dòng mới thêm vào cũng ẩn/hiện cột số tiết đúng
    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.dispatchEvent(new Event('change'));
    }
}

// --- HÀM XỬ LÝ CHÍNH (GIỮ NGUYÊN) ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // UI Reset
    loading.style.display = 'block';
    loading.innerText = "Đang kết nối Gemini và viết từng dòng...";
    error.style.display = 'none';
    previewSection.style.display = 'none';
    previewContent.innerHTML = "";
    btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập MÃ KÍCH HOẠT!");

        // 1. Thu thập dữ liệu
        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            
            // Xử lý an toàn cho các ô số tiết (chỉ tồn tại khi exam_type = 'hk')
            const p1El = row.querySelector('.topic-period-1');
            const p2El = row.querySelector('.topic-period-2');
            const p1 = p1El ? (parseInt(p1El.value) || 0) : 0;
            const p2 = p2El ? (parseInt(p2El.value) || 0) : 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // 2. GỌI API STREAMING
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error; } catch(e){}
            throw new Error(`Lỗi Server (${response.status}): ${errMsg}`);
        }

        // 3. ĐỌC STREAM
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMarkdown = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullMarkdown += chunk;
            
            // Render Realtime
            if(typeof marked !== 'undefined') {
                previewContent.innerHTML = marked.parse(fullMarkdown);
            } else {
                previewContent.innerText = fullMarkdown;
            }
        }

        window.generatedHTML = previewContent.innerHTML;
        loading.style.display = 'none';

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
        loading.style.display = 'none';
    } finally {
        btn.disabled = false;
    }
}

// XỬ LÝ TẢI WORD (GIỮ NGUYÊN)
function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: top; }
                h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 15px; }
            </style>
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { orientation: 'landscape' });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện tạo Word... Vui lòng đợi và bấm lại sau vài giây.");
        }
    } catch (e) {
        alert("Lỗi tạo file: " + e.message);
    }
}
