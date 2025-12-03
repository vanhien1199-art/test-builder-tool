// File: public/js/app.js
// Phiên bản: HTML OUTPUT MODE

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- APP STARTED: HTML MODE ---");
    
    // Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // Gán sự kiện an toàn
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

// --- HÀM TIỆN ÍCH AN TOÀN ---
function getSafeValue(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.error(`❌ LỖI NGHIÊM TRỌNG: File HTML thiếu thẻ có ID="${id}". Vui lòng cập nhật index.html`);
        return "";
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
            const hkOnlyElements = newRow.querySelectorAll('.hk-only');
            hkOnlyElements.forEach(el => {
                el.style.display = 'block';
            });
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
    if(loading) loading.innerText = "Đang kết nối AI và tạo bảng HTML...";
    if(error) error.style.display = 'none';
    if(previewSection) previewSection.style.display = 'none';
    if(previewContent) previewContent.innerHTML = ""; 
    if(btn) btn.disabled = true;

    try {
        // 1. Lấy License Key
        const licenseKey = getSafeValue('license_key');
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu
        const requestData = {
            license_key: licenseKey,
            subject: getSafeValue('subject'),
            grade: getSafeValue('grade'),
            semester: getSafeValue('semester'),
            exam_type: getSafeValue('exam_type'),
            time: getSafeValue('time_limit'),
            use_short_answer: getSafeCheckbox('use_short'),
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

        // 3. GỌI API
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

        // 4. ĐỌC STREAM VÀ HIỂN THỊ HTML TRỰC TIẾP
        if(previewSection) {
            previewSection.style.display = 'block';
            previewSection.scrollIntoView({ behavior: 'smooth' });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHTML += chunk;
            
            // HIỂN THỊ HTML TRỰC TIẾP, KHÔNG DÙNG MARKED
            if(previewContent) {
                previewContent.innerHTML = fullHTML;
                
                // THÊM CSS INLINE CHO CÁC BẢNG
                const tables = previewContent.querySelectorAll('table');
                tables.forEach(table => {
                    table.style.borderCollapse = 'collapse';
                    table.style.width = '100%';
                    table.style.marginBottom = '20px';
                    table.style.fontFamily = "'Times New Roman', serif";
                    table.style.fontSize = '13px';
                    
                    const cells = table.querySelectorAll('th, td');
                    cells.forEach(cell => {
                        if (!cell.style.border) {
                            cell.style.border = '1px solid #000';
                        }
                        cell.style.padding = '6px';
                        cell.style.verticalAlign = 'top';
                        cell.style.textAlign = 'center';
                    });
                });
            }
        }

        // Lưu HTML để tải Word
        window.generatedHTML = fullHTML;
        if(loading) loading.style.display = 'none';

        console.log("✅ Đã tạo HTML thành công");

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
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung để tải! Vui lòng tạo ma trận trước."); 
        return; 
    }

    // Tạo HTML hoàn chỉnh cho Word
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Ma trận đề kiểm tra - CV 7991</title>
            <style>
                body { 
                    font-family: 'Times New Roman', serif; 
                    font-size: 13pt; 
                    line-height: 1.3;
                    margin: 2cm;
                }
                h1, h2, h3, h4 { 
                    text-align: center; 
                    font-weight: bold; 
                    margin-top: 15px;
                }
                h1 { font-size: 16pt; }
                h2 { font-size: 14pt; }
                h3 { font-size: 13pt; }
                
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-bottom: 20px;
                    page-break-inside: avoid;
                }
                th, td { 
                    border: 1px solid #000; 
                    padding: 5px; 
                    vertical-align: top;
                    font-size: 12pt;
                }
                th { 
                    background-color: #f2f2f2;
                    font-weight: bold;
                    text-align: center;
                }
                .header-info {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .footer {
                    text-align: right;
                    margin-top: 50px;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="header-info">
                <h1>BỘ GIÁO DỤC VÀ ĐÀO TẠO</h1>
                <h2>MA TRẬN ĐỀ KIỂM TRA THEO CÔNG VĂN 7991/BGDĐT-GDTrH</h2>
                <p>Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}</p>
            </div>
            
            ${window.generatedHTML}
            
            <div class="footer">
                <p>--- Hết ---</p>
                <p>Tạo bởi ExamMatrix AI - Phiên bản 7991</p>
            </div>
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent);
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện... Vui lòng thử lại sau vài giây.");
        }
    } catch (e) {
        console.error(e);
        alert("Lỗi tải file: " + e.message);
    }
}
