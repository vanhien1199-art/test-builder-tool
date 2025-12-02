// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); // Thêm 1 dòng chủ đề mặc định

    // Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    if(btnAdd) btnAdd.addEventListener('click', addTopicRow);

    const btnGen = document.getElementById('btnGenerate');
    if(btnGen) btnGen.addEventListener('click', handleGenerate);

    const btnDown = document.getElementById('btnDownloadWord');
    if(btnDown) btnDown.addEventListener('click', handleDownloadWord);
});

// Thêm dòng nhập liệu chủ đề
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if(container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
    }
}

// XỬ LÝ CHÍNH: GỌI API
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // Reset UI
    loading.style.display = 'block';
    error.style.display = 'none';
    previewSection.style.display = 'none';
    btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // Thu thập dữ liệu từ Form
        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            time: document.getElementById('time_limit').value,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        if(requestData.totalPeriodsHalf1 <= 0 || requestData.totalPeriodsHalf2 <= 0) {
            throw new Error("Vui lòng nhập Tổng số tiết hợp lệ (lớn hơn 0).");
        }

        const topicRows = document.querySelectorAll('.topic-row');
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

        // Gọi API (Lưu ý: API endpoint là /api_matrix)
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const rawText = await response.text();
        
        if (response.status !== 200) {
            let errMsg = rawText;
            try { errMsg = JSON.parse(rawText).error; } catch(e){}
            throw new Error(errMsg);
        }

        const data = JSON.parse(rawText);
        const markdownResult = data.result;

        // Render Markdown thành HTML
        if(typeof marked !== 'undefined') {
            previewContent.innerHTML = marked.parse(markdownResult);
        } else {
            previewContent.innerText = markdownResult;
        }

        // Lưu HTML vào biến toàn cục để dùng khi tải Word
        window.generatedHTML = previewContent.innerHTML;

        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
    } finally {
        loading.style.display = 'none';
        btn.disabled = false;
    }
}

// XỬ LÝ TẢI FILE WORD (QUAN TRỌNG: ĐỊNH DẠNG BẢNG)
function handleDownloadWord() {
    if (!window.generatedHTML) {
        alert("Chưa có nội dung để tải!");
        return;
    }

    // CSS In-line cho file Word (Bắt buộc để hiện bảng)
    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.3; }
            h1, h2, h3, h4 { text-align: center; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 5px; vertical-align: top; font-size: 11pt; }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            ${css}
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        // Sử dụng html-docx-js (đã được load ở index.html)
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { orientation: 'landscape' }); // Khổ ngang cho ma trận rộng
            saveAs(converted, `Ma_Tran_De_Kiem_Tra_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi: Thư viện tạo file Word chưa tải xong. Vui lòng thử lại.");
        }
    } catch (e) {
        alert("Lỗi khi tạo file Word: " + e.message);
        console.error(e);
    }
}
