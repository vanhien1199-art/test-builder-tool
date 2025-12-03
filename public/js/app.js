// File: public/js/app.js
// Phiên bản: FIX ADD TOPIC BUTTON LOGIC + STREAMING

// Biến toàn cục
var window.generatedHTML = ""; 

// --- KHỞI TẠO ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("--- SYSTEM READY: FINAL CHECK ---");
    
    // Khởi tạo event listeners
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDownload.addEventListener('click', handleDownloadWord);
    
    // Xử lý ẩn/hiện cột số tiết (chạy khi trang load và khi chọn lại)
    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updateTopicRowVisibility);
        // Bắt buộc gọi lần đầu để thiết lập trạng thái ban đầu
        updateTopicRowVisibility(); 
    }

    // Tự động thêm dòng chủ đề đầu tiên khi trang load xong
    addTopicRow(); 
});

// --- HÀM THÊM CHỦ ĐỀ (ĐÃ THÊM LOG CHẶN LỖI) ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    
    // Kiểm tra chéo (Nếu thiếu 1 trong 2 thì code không chạy tiếp)
    if (!container) {
        console.error("❌ LỖI NGHIÊM TRỌNG: Không tìm thấy DIV ID='topics-container'");
        return;
    }
    if (!template) {
        console.error("❌ LỖI NGHIÊM TRỌNG: Không tìm thấy TEMPLATE ID='topic-template' trong index.html!");
        return;
    }

    try {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
        
        // Kích hoạt lại kiểm tra hiển thị cho dòng vừa thêm
        updateTopicRowVisibility(); 
        console.log("✓ Chủ đề mới đã được thêm.");
        
    } catch (e) {
        console.error("❌ Lỗi khi thêm dòng chủ đề:", e);
        // Có thể do lỗi trong template.content.cloneNode(true)
    }
}

// --- HÀM CẬP NHẬT ẨN/HIỆN CỘT SỐ TIẾT ---
function updateTopicRowVisibility() {
    const examTypeSelect = document.getElementById('exam_type');
    if (!examTypeSelect) return;
    
    const isHK = examTypeSelect.value === 'hk';
    
    // Duyệt qua tất cả các phần tử có class 'hk-only' (Là các ô nhập số tiết)
    document.querySelectorAll('.hk-only').forEach(el => {
        el.style.display = isHK ? 'block' : 'none';
        
        // Cần đảm bảo các input con cũng ẩn/hiện
        const inputs = el.querySelectorAll('input');
        inputs.forEach(input => {
             // Đảm bảo không gửi dữ liệu này nếu đang ở chế độ Giữa kì (gk)
            input.disabled = !isHK; 
        });
    });
}


// --- 1. HÀM XỬ LÝ CHÍNH (GIỮ NGUYÊN STREAMING LOGIC) ---
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
        // 1. Thu thập dữ liệu
        const requestData = {
            license_key: document.getElementById('license_key').value.trim(),
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
        
        // ... (Logic thu thập chủ đề và gọi API giữ nguyên) ...

        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            
            // Lấy giá trị P1, P2 (Chỉ lấy nếu không bị disabled)
            const p1El = row.querySelector('.topic-period-1');
            const p2El = row.querySelector('.topic-period-2');

            const p1 = (p1El && !p1El.disabled) ? (parseInt(p1El.value) || 0) : 0;
            const p2 = (p2El && !p2El.disabled) ? (parseInt(p2El.value) || 0) : 0;

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
        console.error(err);
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
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
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
        alert("Lỗi tải file: " + e.message);
    }
}
