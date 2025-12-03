// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); // Thêm dòng đầu tiên
    
    // Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');

    if(btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if(btnGen) btnGen.addEventListener('click', handleGenerate);
    if(btnDown) btnDown.addEventListener('click', handleDownloadWord);
    
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

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
    }
}

// XỬ LÝ CHÍNH
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    loading.style.display = 'block';
    loading.innerText = "Đang kết nối Gemini 2.0 và xây dựng Ma trận HTML...";
    error.style.display = 'none';
    previewSection.style.display = 'none';
    previewContent.innerHTML = ""; 
    btn.disabled = true;

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

        // Gọi API Streaming
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

        // Đọc Stream HTML
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHtml += chunk;
            
            // Xử lý làm sạch HTML rác (nếu AI trả về ```html)
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            previewContent.innerHTML = cleanChunk;
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

// XỬ LÝ TẢI WORD (Đã tối ưu cho HTML Table)
function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
                table { width: 100%; border-collapse: collapse; border: 1px solid black; margin-bottom: 20px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: top; font-size: 11pt; }
                h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 15px; color: black; }
                .text-center { text-align: center; }
                .text-bold { font-weight: bold; }
            </style>
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape', // Khổ ngang cho bảng rộng
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            saveAs(converted, `Ma_Tran_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện... Vui lòng thử lại.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
