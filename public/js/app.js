// File: public/js/app.js

// Biến toàn cục để lưu HTML đã xử lý MathML
window.generatedHTML = null;
window.mathMLProcessedHTML = null;

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

    // Xử lý sự kiện xóa chủ đề
    document.addEventListener('click', (e) => {
        if (e.target.closest('.remove-topic-btn')) {
            const topicItem = e.target.closest('.topic-item');
            if (topicItem && document.querySelectorAll('.topic-item').length > 1) {
                topicItem.remove();
            } else {
                alert('Phải có ít nhất 1 chủ đề!');
            }
        }
    });

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

    // Kiểm tra các thư viện đã load chưa
    console.log('Thư viện đã load:', {
        mammoth: typeof mammoth !== 'undefined',
        latexToMathML: typeof latexToMathML !== 'undefined',
        MathJax: typeof MathJax !== 'undefined',
        htmlDocx: typeof htmlDocx !== 'undefined'
    });
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
            const newRow = container.lastElementChild;
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
        
        // Xử lý MathML cho hiển thị web (tùy chọn)
        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([previewContent]).catch(err => {
                console.log('MathJax rendering error:', err);
            });
        }
        
        loading.classList.add('hidden');

    } catch (err) {
        error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`;
        error.classList.remove('hidden');
        loading.classList.add('hidden');
    } finally {
        btn.disabled = false;
    }
}

// --- HÀM CHUYỂN ĐỔI LaTeX TO MathML ---
function convertLaTeXToMathML(html) {
    if (!html || typeof latexToMathML === 'undefined') {
        console.warn('latexToMathML library not available, skipping conversion');
        return html;
    }

    try {
        // Tạo một DOM ảo để xử lý
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Xử lý tất cả các phần tử text chứa LaTeX
        const walker = document.createTreeWalker(
            doc.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue && (node.nodeValue.includes('$') || node.nodeValue.includes('\\('))) {
                textNodes.push(node);
            }
        }

        // Xử lý từng node
        textNodes.forEach(textNode => {
            let text = textNode.nodeValue;
            
            // Xử lý inline LaTeX $...$ và \(...\)
            text = text.replace(/\$([^$]+)\$/g, (match, latex) => {
                try {
                    const mathml = latexToMathML(latex.trim(), { displayMode: false });
                    return mathml;
                } catch (err) {
                    console.warn('Failed to convert inline LaTeX:', latex, err);
                    return match;
                }
            });
            
            // Xử lý block LaTeX $$...$$ và \[...\]
            text = text.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
                try {
                    const mathml = latexToMathML(latex.trim(), { displayMode: true });
                    return mathml;
                } catch (err) {
                    console.warn('Failed to convert block LaTeX:', latex, err);
                    return match;
                }
            });
            
            // Xử lý cú pháp \(...\)
            text = text.replace(/\\\(([^)]+)\\\)/g, (match, latex) => {
                try {
                    const mathml = latexToMathML(latex.trim(), { displayMode: false });
                    return mathml;
                } catch (err) {
                    console.warn('Failed to convert inline LaTeX (\\()):', latex, err);
                    return match;
                }
            });
            
            // Xử lý cú pháp \[...\]
            text = text.replace(/\\\[([^\]]+)\\\]/g, (match, latex) => {
                try {
                    const mathml = latexToMathML(latex.trim(), { displayMode: true });
                    return mathml;
                } catch (err) {
                    console.warn('Failed to convert block LaTeX (\\[\\]):', latex, err);
                    return match;
                }
            });
            
            // Nếu text đã thay đổi, thay thế node
            if (text !== textNode.nodeValue) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = text;
                
                // Thay thế text node bằng các node mới
                const parent = textNode.parentNode;
                const fragment = document.createDocumentFragment();
                
                Array.from(tempDiv.childNodes).forEach(child => {
                    fragment.appendChild(child.cloneNode(true));
                });
                
                parent.replaceChild(fragment, textNode);
            }
        });
        
        return doc.body.innerHTML;
    } catch (error) {
        console.error('Error converting LaTeX to MathML:', error);
        return html; // Trả về HTML gốc nếu lỗi
    }
}

// --- HÀM XỬ LÝ CÔNG THỨC HÓA HỌC ---
function convertChemicalFormulas(html) {
    // Xử lý công thức hóa học cơ bản: H2O, CO2, H2SO4, etc.
    const chemicalRegex = /([A-Z][a-z]*)(\d+)/g;
    
    return html.replace(chemicalRegex, (match, element, number) => {
        return `${element}<sub>${number}</sub>`;
    });
}

// --- XUẤT FILE WORD VỚI MATHML ---
async function handleDownloadWord() {
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung để xuất!"); 
        return; 
    }

    try {
        // Hiển thị loading
        const loading = document.getElementById('loadingMsg');
        loading.classList.remove('hidden');
        loading.innerHTML = '<div class="spinner"></div><span>Đang xử lý công thức và xuất file Word...</span>';

        // 1. Chuyển đổi LaTeX sang MathML
        let processedHTML = window.generatedHTML;
        
        if (typeof latexToMathML !== 'undefined') {
            console.log('Converting LaTeX to MathML...');
            processedHTML = convertLaTeXToMathML(processedHTML);
        }
        
        // 2. Xử lý công thức hóa học
        processedHTML = convertChemicalFormulas(processedHTML);
        
        // 3. Chuẩn bị CSS đặc biệt cho Word với MathML
        const css = `
            <style>
                /* Base styles for Word */
                body { 
                    font-family: 'Times New Roman', 'Cambria Math', serif;
                    font-size: 13pt;
                    line-height: 1.5;
                    margin: 2cm;
                }
                
                /* Table styles */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    border: 1pt solid #000000;
                    margin: 20px 0;
                }
                
                th, td {
                    border: 1pt solid #000000;
                    padding: 8pt;
                    text-align: left;
                    vertical-align: top;
                }
                
                th {
                    background-color: #F2F2F2;
                    font-weight: bold;
                    text-align: center;
                }
                
                /* Heading styles */
                h1, h2, h3, h4 {
                    text-align: center;
                    font-weight: bold;
                    margin-top: 24pt;
                    margin-bottom: 12pt;
                    color: #000000;
                }
                
                h1 { font-size: 16pt; }
                h2 { font-size: 14pt; }
                h3 { font-size: 13pt; }
                
                /* MathML styles - IMPORTANT for Word compatibility */
                math {
                    display: inline-block;
                    margin: 0 2pt;
                    vertical-align: middle;
                }
                
                mfrac, msqrt, mroot, msub, msup, msubsup, munder, mover, munderover {
                    display: inline-block;
                }
                
                /* Chemical formula styles */
                sub {
                    vertical-align: sub;
                    font-size: 0.7em;
                }
                
                sup {
                    vertical-align: super;
                    font-size: 0.7em;
                }
                
                /* Special formatting */
                .matrix-title {
                    text-align: center;
                    font-weight: bold;
                    font-size: 14pt;
                    margin: 30pt 0 10pt 0;
                }
                
                .exam-info {
                    border: 1pt solid #000000;
                    padding: 15pt;
                    margin: 20pt 0;
                    background-color: #F8F8F8;
                }
                
                .question {
                    margin: 15pt 0;
                    padding-left: 10pt;
                }
                
                /* Page break for Word */
                .page-break {
                    page-break-after: always;
                }
            </style>
        `;

        // 4. Tạo HTML hoàn chỉnh với MathML
        const fullHTML = `
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml" 
                  xmlns:m="http://www.w3.org/1998/Math/MathML">
            <head>
                <meta charset="UTF-8">
                <title>Ma Trận Đề Kiểm Tra</title>
                ${css}
            </head>
            <body>
                <div style="text-align: center; margin-bottom: 30pt;">
                    <h1>MA TRẬN ĐỀ KIỂM TRA</h1>
                    <h2>Môn: ${document.getElementById('subject').value || 'TOÁN'} - Lớp: ${document.getElementById('grade').value || '10'}</h2>
                    <p style="font-style: italic;">Theo Công văn 7991/BGDĐT-GDTrH</p>
                </div>
                
                ${processedHTML}
                
                <div style="margin-top: 40pt; text-align: right; font-style: italic;">
                    <p>Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}</p>
                    <p>ExamMatrix AI Pro - Hệ thống thông minh tạo ma trận đề</p>
                </div>
            </body>
            </html>
        `;

        // 5. Sử dụng mammoth.js để xuất Word với MathML
        if (typeof mammoth !== 'undefined') {
            console.log('Using mammoth.js for Word export...');
            
            // Chuyển đổi HTML sang Word
            const arrayBuffer = await mammoth.convertToArrayBuffer(
                { html: fullHTML },
                {
                    styleMap: [
                        "p[style-name='Heading 1'] => h1:fresh",
                        "p[style-name='Heading 2'] => h2:fresh",
                        "table => table",
                        "math => math"
                    ],
                    convertImage: mammoth.images.imgElement(function(image) {
                        return image.read("base64").then(function(base64) {
                            return {
                                src: "data:" + image.contentType + ";base64," + base64
                            };
                        });
                    })
                }
            );

            // 6. Tạo và tải file
            const blob = new Blob([arrayBuffer], {
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            });
            
            const fileName = `Ma_Tran_De_${document.getElementById('subject').value || 'Toan'}_${document.getElementById('grade').value || '10'}_${new Date().toISOString().slice(0,10)}.docx`;
            
            saveAs(blob, fileName);
            
            console.log('File exported successfully with MathML support');
        } else {
            // Fallback: sử dụng html-docx-js nếu mammoth không có
            console.log('Mammoth not available, using html-docx fallback');
            fallbackToHTMLDocx(processedHTML);
        }

        // Ẩn loading
        loading.classList.add('hidden');

    } catch (error) {
        console.error('Error exporting Word file:', error);
        
        // Hiển thị lỗi
        const errorMsg = document.getElementById('errorMsg');
        errorMsg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi xuất file: ${error.message}`;
        errorMsg.classList.remove('hidden');
        
        // Ẩn loading
        document.getElementById('loadingMsg').classList.add('hidden');
        
        // Fallback cơ bản
        alert(`Lỗi xuất file Word: ${error.message}\n\nThử sử dụng phương pháp dự phòng.`);
        fallbackToHTMLDocx(window.generatedHTML);
    }
}

// --- PHƯƠNG PHÁP DỰ PHÒNG ---
function fallbackToHTMLDocx(htmlContent) {
    if (typeof htmlDocx === 'undefined') {
        alert("Không thể xuất file Word. Vui lòng tải lại trang và thử lại.");
        return;
    }

    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1pt solid black; padding: 5pt; }
            th { background-color: #f0f0f0; }
            .latex-formula { 
                background-color: #f9f9f9; 
                padding: 2pt 4pt; 
                margin: 2pt 0;
                font-family: 'Cambria Math', serif;
                font-style: italic;
            }
        </style>
    `;

    const htmlWithCSS = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">${css}</head>
        <body>
            <div style="text-align: center; margin-bottom: 20pt;">
                <h2>MA TRẬN ĐỀ KIỂM TRA</h2>
                <p><em>(Xuất bản bằng phương pháp dự phòng)</em></p>
            </div>
            ${htmlContent}
        </body>
        </html>
    `;

    try {
        const converted = htmlDocx.asBlob(htmlWithCSS, {
            orientation: 'portrait',
            margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        });
        
        saveAs(converted, `Ma_Tran_De_Fallback_${new Date().getTime()}.docx`);
        
        alert("Đã xuất file bằng phương pháp dự phòng. Công thức có thể không hiển thị đầy đủ.");
    } catch (e) {
        alert("Lỗi xuất file dự phòng: " + e.message);
    }
}

// --- KIỂM TRA ĐỊNH DẠNG CÔNG THỨC ---
function testMathConversion() {
    const testCases = [
        '$$E = mc^2$$',
        'Phương trình bậc hai: $ax^2 + bx + c = 0$',
        'Công thức tích phân: $\int_{a}^{b} f(x) dx$',
        'Công thức hóa học: H2SO4 + 2NaOH → Na2SO4 + 2H2O',
        'Định lý Pythagoras: $a^2 + b^2 = c^2$',
        'Công thức lượng giác: $\sin^2 x + \cos^2 x = 1$',
        'Công thức vật lý: $F = ma$'
    ];
    
    console.log('Testing MathML conversion:');
    testCases.forEach(test => {
        console.log('Input:', test);
        console.log('Output:', convertLaTeXToMathML(test));
        console.log('---');
    });
}
