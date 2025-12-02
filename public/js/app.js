// File: public/js/app.js
// Phiên bản: ULTRA SAFE (Chống crash khi thiếu HTML ID)

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- APP STARTED: SAFE MODE ---");
    
    // Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // Gán sự kiện an toàn (Kiểm tra nút có tồn tại không trước khi gán)
    const bindEvent = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
        else console.warn(`⚠️ Cảnh báo: Không tìm thấy nút có ID '${id}'`);
    };

    bindEvent('btnAddTopic', 'click', addTopicRow);
    bindEvent('btnGenerate', 'click', handleGenerate);
    bindEvent('btnDownloadWord', 'click', handleDownloadWord);
    
    // Xử lý ẩn/hiện cột số tiết (Học kì)
    const examTypeSelect = document.getElementById('exam_type');
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            document.querySelectorAll('.hk-only').forEach(el => {
                el.style.display = isHK ? 'block' : 'none';
            });
        });
    }
});

// --- HÀM TIỆN ÍCH AN TOÀN (FIX LỖI NULL VALUE) ---
function getSafeValue(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.error(`❌ LỖI NGHIÊM TRỌNG: File HTML thiếu thẻ có ID="${id}". Vui lòng cập nhật index.html`);
        return ""; // Trả về rỗng để không bị crash
    }
    return el.value.trim();
}

function getSafeCheckbox(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

// Thêm dòng chủ đề
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
        
        // Cập nhật hiển thị nếu đang chọn Học kì
        const examType = document.getElementById('exam_type');
        if (examType && examType.value === 'hk') {
            const newRow = container.lastElementChild;
            // Logic CSS sẽ tự xử lý hiển thị class .hk-only
        }
    }
}

// --- XỬ LÝ CHÍNH ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // UI Reset
    if(loading) loading.style.display = 'block';
    if(loading) loading.innerText = "Đang kết nối AI và viết từng dòng...";
    if(error) error.style.display = 'none';
    if(previewSection) previewSection.style.display = 'none';
    if(previewContent) previewContent.innerHTML = ""; 
    if(btn) btn.disabled = true;

    try {
        // 1. Lấy License Key (Dùng hàm an toàn)
        const licenseKey = getSafeValue('license_key');
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu (Dùng hàm an toàn để tránh lỗi 'reading value of null')
        const requestData = {
            license_key: licenseKey,
            subject: getSafeValue('subject'),
            grade: getSafeValue('grade'),
            semester: getSafeValue('semester'),
            exam_type: getSafeValue('exam_type'),
            time: getSafeValue('time_limit'),
            use_short_answer: getSafeCheckbox('use_short'), // Checkbox
            totalPeriodsHalf1: parseInt(getSafeValue('total_half1')) || 0,
            totalPeriodsHalf2: parseInt(getSafeValue('total_half2')) || 0,
            topics: []
        };

        // Kiểm tra dữ liệu bắt buộc
        if (!requestData.subject || !requestData.grade) {
            throw new Error("Vui lòng nhập đầy đủ Môn học và Lớp!");
        }

        // Thu thập chủ đề
        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const nameEl = row.querySelector('.topic-name');
            const contentEl = row.querySelector('.topic-content');
            const p1El = row.querySelector('.topic-period-1');
            const p2El = row.querySelector('.topic-period-2');

            // Chỉ lấy dữ liệu nếu các ô nhập tồn tại
            if (nameEl && contentEl) {
                const name = nameEl.value.trim();
                const content = contentEl.value.trim();
                const p1 = p1El ? (parseInt(p1El.value) || 0) : 0;
                const p2 = p2El ? (parseInt(p2El.value) || 0) : 0;

                if (name && content) {
                    requestData.topics.push({ name, content, p1, p2 });
                }
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // 3. GỌI API (STREAMING)
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

        // 4. ĐỌC STREAM
        if(previewSection) {
            previewSection.style.display = 'block';
            previewSection.scrollIntoView({ behavior: 'smooth' });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMarkdown = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullMarkdown += chunk;
            
            if(typeof marked !== 'undefined') {
                if(previewContent) previewContent.innerHTML = marked.parse(fullMarkdown);
            } else {
                if(previewContent) previewContent.innerText = fullMarkdown;
            }
        }

        window.generatedHTML = previewContent ? previewContent.innerHTML : "";
        if(loading) loading.style.display = 'none';

    } catch (err) {
        console.error(err);
        if(error) {
            error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
            error.style.display = 'block';
        }
        if(loading) loading.style.display = 'none';
    } finally {
        if(btn) btn.disabled = false;
    }
}

// XỬ LÝ TẢI WORD
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
            alert("Đang tải thư viện... Vui lòng thử lại.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
