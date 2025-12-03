// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Xử lý Logic ẩn hiện ô nhập số tiết (Học kì)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = document.getElementById('hk-config');
            const topicPeriodInputs = document.querySelectorAll('.hk-period-inputs');

            // Ẩn hiện phần tổng tiết chung
            if (hkConfig) {
                if (isHK) hkConfig.classList.remove('hidden');
                else hkConfig.classList.add('hidden');
            }

            // Ẩn hiện phần số tiết con trong từng chủ đề
            topicPeriodInputs.forEach(el => {
                if (isHK) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        });
        // Kích hoạt ngay lần đầu
        examTypeSelect.dispatchEvent(new Event('change'));
    }
});

// --- HÀM THÊM CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');

    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);

        // Kiểm tra lại trạng thái hiển thị của dòng mới thêm
        const examType = document.getElementById('exam_type');
        if (examType) {
            const isHK = examType.value === 'hk';
            const newRow = container.lastElementChild; // Dòng vừa thêm (div.topic-item)
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) {
                if (isHK) hkInputs.classList.remove('hidden');
                else hkInputs.classList.add('hidden');
            }
        }
    }
}

// --- XỬ LÝ CHÍNH: GỌI API STREAMING ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // UI Reset
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    previewSection.classList.add('hidden');
    previewContent.innerHTML = "";
    btn.disabled = true;
    error.innerHTML = "";

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

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

        // Thu thập chủ đề
        const topicRows = document.querySelectorAll('.topic-item'); // Class mới
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // Gọi API
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

        // Hiện khung Preview
        previewSection.classList.remove('hidden');
        previewSection.scrollIntoView({ behavior: 'smooth' });

        // Đọc Stream HTML
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHtml += chunk;
            
            // Xóa rác Markdown nếu có
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            previewContent.innerHTML = cleanChunk;
        }

        window.generatedHTML = previewContent.innerHTML;
        loading.classList.add('hidden');

    } catch (err) {
        error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`;
        error.classList.remove('hidden');
        loading.classList.add('hidden');
    } finally {
        btn.disabled = false;
    }
}

// --- XUẤT FILE WORD ---
function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
            table { width: 100%; border-collapse: collapse; border: 1pt solid black; margin-bottom: 20px; }
            th, td { border: 1pt solid black; padding: 5px; vertical-align: top; font-size: 11pt; }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 15pt; color: #000; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">${css}</head>
        <body>${window.generatedHTML}</body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape',
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi thư viện Word. Vui lòng tải lại trang.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
