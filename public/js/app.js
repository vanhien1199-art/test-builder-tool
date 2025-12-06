// File: public/js/app.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();
    
    // 2. Gán sự kiện cho các nút
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');
    
    if (btnAdd) {
        btnAdd.addEventListener('click', addTopicRow);
        console.log('Add topic button event attached');
    }
    
    if (btnGen) {
        btnGen.addEventListener('click', handleGenerate);
        console.log('Generate button event attached');
    }
    
    if (btnDown) {
        btnDown.addEventListener('click', handleDownloadWord);
        console.log('Download button event attached');
    }
    
    // 3. Xử lý sự kiện xóa chủ đề (sử dụng event delegation)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.remove-topic-btn')) {
            e.preventDefault();
            const topicItem = e.target.closest('.topic-item');
            if (topicItem) {
                const allTopics = document.querySelectorAll('.topic-item');
                if (allTopics.length > 1) {
                    topicItem.remove();
                    console.log('Topic removed');
                } else {
                    alert('Phải có ít nhất 1 chủ đề!');
                }
            }
        }
    });
    
    // 4. Xử lý Logic ẩn hiện ô nhập số tiết (Học kì)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = document.getElementById('hk-config');
            const topicPeriodInputs = document.querySelectorAll('.hk-period-inputs');
            
            // Ẩn hiện phần tổng tiết chung
            if (hkConfig) {
                if (isHK) {
                    hkConfig.classList.remove('hidden');
                } else {
                    hkConfig.classList.add('hidden');
                }
            }
            
            // Ẩn hiện phần số tiết con trong từng chủ đề
            topicPeriodInputs.forEach(el => {
                if (isHK) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });
        });
        
        // Kích hoạt ngay lần đầu
        setTimeout(() => {
            examTypeSelect.dispatchEvent(new Event('change'));
        }, 100);
    }
    
    console.log('App initialized successfully');
});

// --- HÀM THÊM CHỦ ĐỀ ---
function addTopicRow() {
    console.log('Adding topic row...');
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
        
        // Kiểm tra lại trạng thái hiển thị của dòng mới thêm
        const examType = document.getElementById('exam_type');
        if (examType) {
            const isHK = examType.value === 'hk';
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) {
                if (isHK) {
                    hkInputs.classList.remove('hidden');
                } else {
                    hkInputs.classList.add('hidden');
                }
            }
        }
        
        console.log('Topic row added');
    }
}

// --- XỬ LÝ CHÍNH: GỌI API STREAMING ---
async function handleGenerate() {
    console.log('Handle generate called');
    
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');
    
    // UI Reset
    if (loading) loading.classList.remove('hidden');
    if (error) error.classList.add('hidden');
    if (previewSection) previewSection.classList.add('hidden');
    if (previewContent) previewContent.innerHTML = "";
    if (btn) btn.disabled = true;
    if (error) error.innerHTML = "";
    
    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) {
            throw new Error("Vui lòng nhập Mã Kích Hoạt!");
        }
        
        // Thu thập dữ liệu từ form
        const subject = document.getElementById('subject').value.trim();
        const grade = document.getElementById('grade').value.trim();
        
        if (!subject || !grade) {
            throw new Error("Vui lòng nhập đầy đủ thông tin Môn học và Lớp!");
        }
        
        const requestData = {
            license_key: licenseKey,
            subject: subject,
            grade: grade,
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };
        
        // Thu thập chủ đề
        const topicRows = document.querySelectorAll('.topic-item');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1')?.value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2')?.value) || 0;
            
            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
            }
        });
        
        if (requestData.topics.length === 0) {
            throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");
        }
        
        console.log('Sending request:', requestData);
        
        // Gọi API
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            let errMsg = `Lỗi Server (${response.status})`;
            try { 
                const errJson = JSON.parse(errText);
                errMsg = errJson.error || errText;
            } catch(e) {
                errMsg = errText;
            }
            throw new Error(errMsg);
        }
        
        // Hiện khung Preview
        if (previewSection) {
            previewSection.classList.remove('hidden');
            previewSection.scrollIntoView({ behavior: 'smooth' });
        }
        
        // Đọc Stream HTML
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHtml += chunk;
            
            // Hiển thị từng phần
            if (previewContent) {
                previewContent.innerHTML = fullHtml;
            }
        }
        
        // Lưu HTML đã tạo
        window.generatedHTML = fullHtml;
        console.log('Generation complete, HTML saved');
        
        if (loading) loading.classList.add('hidden');
        
    } catch (err) {
        console.error('Generation error:', err);
        
        if (error) {
            error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`;
            error.classList.remove('hidden');
        }
        
        if (loading) loading.classList.add('hidden');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// --- HÀM CHUYỂN ĐỔI CÔNG THỨC ĐƠN GIẢN ---
function convertSimpleFormulas(html) {
    if (!html) return html;
    
    // Xử lý công thức hóa học: H2O -> H₂O
    let result = html.replace(/([A-Z][a-z]*)(\d+)/g, function(match, element, number) {
        return element + '<sub>' + number + '</sub>';
    });
    
    // Xử lý chỉ số trên: x^2 -> x²
    result = result.replace(/([a-zA-Z0-9])\^(\d+)/g, function(match, base, exponent) {
        return base + '<sup>' + exponent + '</sup>';
    });
    
    return result;
}

// --- XUẤT FILE WORD ---
async function handleDownloadWord() {
    console.log('Handle download word called');
    
    if (!window.generatedHTML || window.generatedHTML.trim() === '') { 
        alert("Chưa có nội dung để xuất!"); 
        return; 
    }
    
    try {
        // Hiển thị loading
        const loading = document.getElementById('loadingMsg');
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML = '<div class="spinner"></div><span>Đang xử lý và xuất file Word...</span>';
        }
        
        // 1. Xử lý công thức đơn giản
        let processedHTML = convertSimpleFormulas(window.generatedHTML);
        
        // 2. Thử sử dụng mammoth.js nếu có
        if (typeof mammoth !== 'undefined') {
            console.log('Using mammoth.js for export');
            
            try {
                const css = `
                    <style>
                        body { 
                            font-family: 'Times New Roman', serif; 
                            font-size: 13pt; 
                            line-height: 1.5;
                            margin: 2cm;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            border: 1pt solid #000000;
                            margin: 20px 0;
                        }
                        th, td {
                            border: 1pt solid #000000;
                            padding: 8px;
                            text-align: left;
                        }
                        th {
                            background-color: #F2F2F2;
                            font-weight: bold;
                            text-align: center;
                        }
                        h1, h2, h3 {
                            text-align: center;
                            margin-top: 24pt;
                        }
                        .math-formula {
                            font-family: 'Cambria Math', serif;
                            margin: 5px 0;
                        }
                        sub, sup {
                            font-size: 0.8em;
                        }
                    </style>
                `;
                
                const fullHTML = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>Ma Trận Đề Kiểm Tra</title>
                        ${css}
                    </head>
                    <body>
                        <div style="text-align: center;">
                            <h1>MA TRẬN ĐỀ KIỂM TRA</h1>
                            <h2>Môn: ${document.getElementById('subject').value || ''} - Lớp: ${document.getElementById('grade').value || ''}</h2>
                        </div>
                        ${processedHTML}
                        <div style="margin-top: 40px; text-align: right; font-style: italic;">
                            <p>Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}</p>
                        </div>
                    </body>
                    </html>
                `;
                
                const arrayBuffer = await mammoth.convertToArrayBuffer(
                    { html: fullHTML },
                    {
                        styleMap: [
                            "p[style-name='Heading 1'] => h1:fresh",
                            "p[style-name='Heading 2'] => h2:fresh",
                            "table => table"
                        ]
                    }
                );
                
                const blob = new Blob([arrayBuffer], {
                    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });
                
                const fileName = `Ma_Tran_${document.getElementById('subject').value || 'De'}_${new Date().getTime()}.docx`;
                saveAs(blob, fileName);
                
                console.log('File exported with mammoth.js');
                
            } catch (mammothError) {
                console.error('Mammoth error, using fallback:', mammothError);
                fallbackToHTMLDocx(processedHTML);
            }
            
        } else {
            // Fallback: dùng html-docx-js
            console.log('Mammoth not available, using html-docx');
            fallbackToHTMLDocx(processedHTML);
        }
        
        // Ẩn loading
        if (loading) {
            loading.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        
        // Hiển thị lỗi
        const errorMsg = document.getElementById('errorMsg');
        if (errorMsg) {
            errorMsg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi xuất file: ${error.message}`;
            errorMsg.classList.remove('hidden');
        }
        
        // Ẩn loading
        const loading = document.getElementById('loadingMsg');
        if (loading) loading.classList.add('hidden');
        
        alert("Lỗi khi xuất file: " + error.message);
    }
}

// --- PHƯƠNG PHÁP DỰ PHÒNG ---
function fallbackToHTMLDocx(htmlContent) {
    console.log('Using fallback html-docx method');
    
    if (typeof htmlDocx === 'undefined') {
        alert("Không thể xuất file Word. Vui lòng tải lại trang!");
        return;
    }
    
    const css = `
        <style>
            body { 
                font-family: 'Times New Roman', serif; 
                font-size: 13pt; 
                line-height: 1.5;
                margin: 2cm;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                border: 1pt solid #000000;
                margin: 20px 0;
            }
            th, td {
                border: 1pt solid #000000;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #F2F2F2;
                font-weight: bold;
                text-align: center;
            }
            h1, h2, h3 {
                text-align: center;
                margin-top: 24pt;
            }
            sub {
                vertical-align: sub;
                font-size: 0.8em;
            }
            sup {
                vertical-align: super;
                font-size: 0.8em;
            }
        </style>
    `;
    
    const htmlWithCSS = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            ${css}
        </head>
        <body>
            <div style="text-align: center;">
                <h1>MA TRẬN ĐỀ KIỂM TRA</h1>
                <h2>Môn: ${document.getElementById('subject').value || ''} - Lớp: ${document.getElementById('grade').value || ''}</h2>
                <p><em>(Xuất bản bằng phương pháp dự phòng)</em></p>
            </div>
            ${htmlContent}
            <div style="margin-top: 40px; text-align: right; font-style: italic;">
                <p>Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}</p>
                <p>ExamMatrix AI Pro</p>
            </div>
        </body>
        </html>
    `;
    
    try {
        const converted = htmlDocx.asBlob(htmlWithCSS, {
            orientation: 'portrait',
            margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        });
        
        const fileName = `Ma_Tran_De_${new Date().getTime()}.docx`;
        saveAs(converted, fileName);
        
        console.log('File exported with html-docx');
        
    } catch (e) {
        console.error('Fallback export error:', e);
        alert("Lỗi xuất file dự phòng: " + e.message);
    }
}

// --- KIỂM TRA NÚT HOẠT ĐỘNG ---
function testButtons() {
    console.log('Testing buttons...');
    
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    
    console.log('Add button exists:', !!btnAdd);
    console.log('Generate button exists:', !!btnGen);
    console.log('Download button exists:', !!btnDown);
    
    // Test click
    if (btnAdd) {
        btnAdd.click();
        console.log('Add button clicked');
    }
}

// Gọi test khi trang load xong
window.addEventListener('load', function() {
    console.log('Page fully loaded');
    // testButtons(); // Bỏ comment để test
});
