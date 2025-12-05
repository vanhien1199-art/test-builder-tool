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
// File: public/js/app.js

// --- 1. HÀM CHÍNH: XUẤT FILE WORD ---
async function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung để xuất!"); return; }
    
    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý Math...`;
    btn.disabled = true;

    try {
        // Import các thành phần từ thư viện docx
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, TextRun, AlignmentType } = docx;

        // Phân tích HTML hiện tại
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const elements = Array.from(docHTML.body.children);
        
        const docxChildren = [];

        // Tiêu đề file
        docxChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA (Được tạo bởi AI)",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Duyệt qua từng phần tử HTML
        for (const el of elements) {
            // Xử lý Tiêu đề H2, H3
            if (el.tagName === 'H2' || el.tagName === 'H3') {
                docxChildren.push(new Paragraph({
                    text: el.innerText,
                    heading: el.tagName === 'H2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
                    spacing: { before: 200, after: 100 }
                }));
            }
            // Xử lý Bảng (Table)
            else if (el.tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => {
                    const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
                        // RECURSIVE PARSE: Nội dung trong ô bảng
                        const cellContent = parseHtmlContentToDocx(td.innerHTML);
                        
                        return new TableCell({
                            children: cellContent, // Mảng các Paragraph
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1 },
                                bottom: { style: BorderStyle.SINGLE, size: 1 },
                                left: { style: BorderStyle.SINGLE, size: 1 },
                                right: { style: BorderStyle.SINGLE, size: 1 },
                            },
                            margins: { top: 100, bottom: 100, left: 100, right: 100 }
                        });
                    });
                    return new TableRow({ children: cells });
                });

                docxChildren.push(new Table({
                    rows: rows,
                    width: { size: 100, type: WidthType.PERCENTAGE }
                }));
                docxChildren.push(new Paragraph({ text: "" })); // Cách dòng sau bảng
            }
            // Xử lý đoạn văn thường (P, DIV...)
            else {
                const paragraphs = parseHtmlContentToDocx(el.innerHTML);
                docxChildren.push(...paragraphs);
            }
        }

        // Tạo Document
        const doc = new Document({
            sections: [{
                properties: {},
                children: docxChildren
            }]
        });

        // Xuất file
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Kiem_Tra_LaTeX_${new Date().getTime()}.docx`);

    } catch (e) {
        console.error(e);
        alert("Lỗi xuất file: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- 2. HÀM TÁCH TEXT VÀ LATEX ($$...$$) ---
function parseHtmlContentToDocx(htmlString) {
    const { Paragraph, TextRun, Math: MathObj } = docx;

    // Tách chuỗi bởi dấu $$ (Quy ước LaTeX của chúng ta)
    const parts = htmlString.split(/\$\$(.*?)\$\$/g);
    
    // Một ô/dòng có thể chứa nhiều đoạn text và công thức nối tiếp nhau
    // DOCX yêu cầu các TextRun và Math phải nằm trong Paragraph
    // Ở đây ta gom tất cả vào 1 Paragraph cho đơn giản (hoặc chia nhỏ nếu có <br>)
    
    const children = [];

    parts.forEach((part, index) => {
        if (index % 2 === 1) {
            // === ĐÂY LÀ LATEX ===
            try {
                // Bước 1: LaTeX -> MathML string (Dùng Temml)
                const mathmlString = temml.renderToString(part, { xml: true });
                
                // Bước 2: Parse MathML String -> Docx Math Objects
                const mathObject = convertMathmlToDocx(mathmlString);
                
                if (mathObject) {
                    children.push(mathObject);
                } else {
                    // Fallback nếu lỗi parse
                    children.push(new TextRun({ text: `$$${part}$$`, color: "FF0000" }));
                }
            } catch (err) {
                console.error("Lỗi parse LaTeX:", part, err);
                children.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "red" }));
            }
        } else {
            // === ĐÂY LÀ TEXT THƯỜNG ===
            // Xóa thẻ HTML cơ bản để lấy text sạch
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = part;
            const text = tempDiv.innerText; // Lấy text sạch
            if (text) {
                children.push(new TextRun({ text: text }));
            }
        }
    });

    return [new Paragraph({ children: children })];
}

// --- 3. CORE: CONVERT MATHML (XML) -> DOCX OBJECTS (OMML) ---
function convertMathmlToDocx(mathmlString) {
    const { Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, MathSum } = docx;

    // Parse XML string thành DOM
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mathmlString, "text/xml");
    const rootMath = xmlDoc.getElementsByTagName("math")[0];

    if (!rootMath) return null;

    // Hàm đệ quy duyệt cây XML
    function traverse(node) {
        if (!node) return [];
        const results = [];

        // Duyệt qua các node con
        const childNodes = Array.from(node.childNodes);

        for (const child of childNodes) {
            if (child.nodeType === 3) { // Text node
                // Bỏ qua text node trống hoặc xuống dòng
                if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                continue;
            }

            const tagName = child.tagName.toLowerCase();
            const grandChildren = traverse(child); // Đệ quy lấy con của node hiện tại

            switch (tagName) {
                // --- SỐ và KÝ TỰ ---
                case 'mn': // Number
                case 'mi': // Identifier (biến x, y)
                case 'mo': // Operator (+, -, =)
                case 'mtext': // Text trong công thức
                    results.push(new MathRun(child.textContent));
                    break;

                // --- PHÂN SỐ (frac) ---
                case 'mfrac':
                    // mfrac có 2 con: tử số và mẫu số
                    if (grandChildren.length >= 2) {
                        results.push(new MathFraction({
                            numerator: [grandChildren[0]],   // Tử
                            denominator: [grandChildren[1]]  // Mẫu
                        }));
                    }
                    break;

                // --- MŨ (sup) ---
                case 'msup':
                    if (grandChildren.length >= 2) {
                        results.push(new MathSuperScript({
                            children: [grandChildren[0]], // Cơ số
                            superScript: [grandChildren[1]] // Số mũ
                        }));
                    }
                    break;

                // --- CHỈ SỐ DƯỚI (sub) ---
                case 'msub':
                    if (grandChildren.length >= 2) {
                        results.push(new MathSubScript({
                            children: [grandChildren[0]],
                            subScript: [grandChildren[1]]
                        }));
                    }
                    break;

                // --- CĂN BẬC 2 (sqrt) ---
                case 'msqrt':
                    results.push(new MathRadical({
                        children: grandChildren // Nội dung trong căn
                    }));
                    break;
                
                // --- CÁC ROW (mrow) ---
                case 'mrow':
                    // mrow chỉ là nhóm, cứ đẩy hết con của nó ra
                    results.push(...grandChildren);
                    break;

                // --- Mặc định: Nếu chưa hỗ trợ tag này, lấy text bên trong ---
                default:
                    results.push(...grandChildren);
                    break;
            }
        }
        return results;
    }

    // Bắt đầu convert từ root
    const convertedChildren = traverse(rootMath);
    
    // Trả về đối tượng Math của docx chứa toàn bộ cấu trúc
    return new MathObj({
        children: convertedChildren
    });
}
