// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện cho các nút
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
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) {
                if (isHK) hkInputs.classList.remove('hidden');
                else hkInputs.classList.add('hidden');
            }
            
            // Gán sự kiện xóa cho nút vừa thêm
            const btnRemove = newRow.querySelector('.remove-topic-btn');
            if(btnRemove) {
                btnRemove.addEventListener('click', function() {
                    newRow.remove();
                });
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
        // Tạm thời bỏ qua check license rỗng nếu muốn test nhanh, hoặc giữ nguyên
        // if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

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

            // Xóa rác Markdown (```html) nếu có
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            previewContent.innerHTML = cleanChunk;
        }

        // Render lại LaTeX trong Preview (nếu dùng MathJax để xem trước)
        // Nếu không có MathJax thì người dùng vẫn thấy $$...$$
        if(typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([previewContent]);
        }

        // Lưu nội dung sạch vào biến global để dùng khi tải xuống
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

// ============================================================
// --- PHẦN XỬ LÝ XUẤT FILE WORD (LATEX -> OMML -> DOCX) ---
// ============================================================

async function handleDownloadWord() {
    // 1. Kiểm tra dữ liệu và thư viện
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung để xuất file!"); return; 
    }
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện 'docx' chưa tải xong. Vui lòng tải lại trang (F5)!");
        return;
    }
    if (typeof temml === 'undefined') {
        alert("Cảnh báo: Thư viện 'temml' chưa tải. Công thức toán có thể bị lỗi.");
    }

    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo file...`;
    btn.disabled = true;

    try {
        // Destructure các component cần thiết từ thư viện docx
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, AlignmentType } = docx;

        // Parse HTML từ kết quả đã sinh ra
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const elements = Array.from(docHTML.body.children);
        
        const docxChildren = [];

        // Thêm Tiêu đề chính
        docxChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Duyệt qua từng phần tử HTML để convert sang DOCX Object
        for (const el of elements) {
            // --- XỬ LÝ TIÊU ĐỀ (H2, H3) ---
            if (el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'H4') {
                let level = HeadingLevel.HEADING_2;
                if(el.tagName === 'H3') level = HeadingLevel.HEADING_3;
                if(el.tagName === 'H4') level = HeadingLevel.HEADING_4;

                docxChildren.push(new Paragraph({
                    text: el.innerText,
                    heading: level,
                    spacing: { before: 200, after: 100 }
                }));
            }
            // --- XỬ LÝ BẢNG (TABLE) ---
            else if (el.tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => {
                    const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
                        // Gọi hàm xử lý nội dung trong ô (bao gồm text và công thức)
                        const cellParagraphs = parseContentToDocx(td.innerHTML);
                        
                        return new TableCell({
                            children: cellParagraphs, 
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            verticalAlign: "center",
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            },
                            margins: { top: 50, bottom: 50, left: 100, right: 100 }
                        });
                    });
                    return new TableRow({ children: cells });
                });

                docxChildren.push(new Table({
                    rows: rows,
                    width: { size: 100, type: WidthType.PERCENTAGE }
                }));
                docxChildren.push(new Paragraph({ text: "" })); // Khoảng trắng sau bảng
            }
            // --- XỬ LÝ ĐOẠN VĂN THƯỜNG (P, DIV, LI) ---
            else {
                // Chỉ xử lý nếu có nội dung text
                if(el.innerText.trim().length > 0) {
                     const paragraphs = parseContentToDocx(el.innerHTML);
                     docxChildren.push(...paragraphs);
                }
            }
        }

        // Tạo Document
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: { top: 720, right: 720, bottom: 720, left: 720 } // Margin 0.5 inch
                    }
                },
                children: docxChildren
            }]
        });

        // Xuất file Blob và tải về
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `Ma_Tran_De_Thi_${new Date().getTime()}.docx`);

    } catch (e) {
        console.error(e);
        alert("Lỗi xuất file: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ------------------------------------------------------------------
// HELPERS: CÁC HÀM HỖ TRỢ PARSE NỘI DUNG VÀ CÔNG THỨC TOÁN
// ------------------------------------------------------------------

/**
 * Hàm tách chuỗi HTML thành các đoạn Text và Công thức LaTeX
 * Input: "Tìm x biết $$x^2=4$$ nhé"
 * Output: [Paragraph(Run("Tìm x biết "), Math(x^2=4), Run(" nhé"))]
 */
function parseContentToDocx(htmlString) {
    const { Paragraph, TextRun } = docx;

    // Tách chuỗi theo dấu $$ (Quy ước LaTeX)
    const parts = htmlString.split(/\$\$(.*?)\$\$/g);
    
    // Mảng chứa các TextRun hoặc MathObject
    const children = [];

    parts.forEach((part, index) => {
        if (index % 2 === 1) {
            // === PHẦN CÔNG THỨC (LATEX) ===
            try {
                // 1. Dùng Temml convert LaTeX -> MathML XML string
                if (typeof temml !== 'undefined') {
                    const mathmlString = temml.renderToString(part, { xml: true });
                    // 2. Convert XML string -> Docx Math Objects
                    const mathObj = convertMathmlToDocx(mathmlString);
                    if (mathObj) {
                        children.push(mathObj);
                    } else {
                        // Fallback nếu convert lỗi
                        children.push(new TextRun({ text: ` $$${part}$$ `, color: "FF0000" }));
                    }
                } else {
                    // Nếu không có thư viện temml
                    children.push(new TextRun({ text: ` $$${part}$$ `, bold: true }));
                }
            } catch (err) {
                console.error("Lỗi convert LaTeX:", part, err);
                children.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "red" }));
            }
        } else {
            // === PHẦN TEXT THƯỜNG ===
            // Cần loại bỏ các thẻ HTML cơ bản (<b>, <i>...) để lấy text sạch cho docx
            // (Phiên bản nâng cao có thể map <b> -> bold: true, nhưng ở đây làm đơn giản)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = part; // Decode HTML entities
            const cleanText = tempDiv.innerText; // Lấy text thuần
            
            if (cleanText) {
                children.push(new TextRun({ text: cleanText }));
            }
        }
    });

    // Trả về mảng Paragraph (Hiện tại gom hết vào 1 paragraph)
    return [new Paragraph({ children: children })];
}

/**
 * CORE FUNCTION: Convert MathML String -> Docx Math Objects (Recursive)
 */
function convertMathmlToDocx(mathmlString) {
    const { Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, MathSum } = docx;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mathmlString, "text/xml");
    const rootMath = xmlDoc.getElementsByTagName("math")[0];

    if (!rootMath) return null;

    // Hàm đệ quy duyệt cây XML
    function traverse(node) {
        if (!node) return [];
        const results = [];
        const childNodes = Array.from(node.childNodes);

        for (const child of childNodes) {
            // Node văn bản (Text node)
            if (child.nodeType === 3) { 
                if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                continue;
            }

            const tagName = child.tagName.toLowerCase();
            const grandChildren = traverse(child); // Đệ quy

            switch (tagName) {
                case 'mn': // Số
                case 'mi': // Biến
                case 'mo': // Toán tử
                case 'mtext': // Text
                    results.push(new MathRun(child.textContent));
                    break;

                case 'mfrac': // Phân số
                    if (grandChildren.length >= 2) {
                        results.push(new MathFraction({
                            numerator: [grandChildren[0]],
                            denominator: [grandChildren[1]]
                        }));
                    }
                    break;

                case 'msup': // Mũ
                    if (grandChildren.length >= 2) {
                        results.push(new MathSuperScript({
                            children: [grandChildren[0]],
                            superScript: [grandChildren[1]]
                        }));
                    }
                    break;

                case 'msub': // Chỉ số dưới
                    if (grandChildren.length >= 2) {
                        results.push(new MathSubScript({
                            children: [grandChildren[0]],
                            subScript: [grandChildren[1]]
                        }));
                    }
                    break;

                case 'msqrt': // Căn bậc 2
                    results.push(new MathRadical({
                        children: grandChildren
                    }));
                    break;
                
                case 'mrow': // Nhóm
                    results.push(...grandChildren);
                    break;

                default: // Mặc định: Lấy text hoặc con bên trong
                    results.push(...grandChildren);
                    break;
            }
        }
        return results;
    }

    const convertedChildren = traverse(rootMath);
    return new MathObj({ children: convertedChildren });
}
