// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); // Init dòng đầu

    // Gán sự kiện an toàn (kiểm tra tồn tại trước khi gán)
    const el = (id) => document.getElementById(id);
    if(el('btnAddTopic')) el('btnAddTopic').addEventListener('click', addTopicRow);
    if(el('btnGenerate')) el('btnGenerate').addEventListener('click', handleGenerate);
    if(el('btnDownloadWord')) el('btnDownloadWord').addEventListener('click', handleDownloadWord);
    
    if(el('exam_type')) {
        el('exam_type').addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = el('hk-config');
            if(hkConfig) isHK ? hkConfig.classList.remove('hidden') : hkConfig.classList.add('hidden');
            document.querySelectorAll('.hk-period-inputs').forEach(d => isHK ? d.classList.remove('hidden') : d.classList.add('hidden'));
        });
        el('exam_type').dispatchEvent(new Event('change'));
    }
});

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Check lại mode Học kì
    const examType = document.getElementById('exam_type');
    if (examType && examType.value === 'hk') {
        const newRow = container.lastElementChild;
        newRow.querySelector('.hk-period-inputs').classList.remove('hidden');
    }
    
    // Nút xóa
    container.lastElementChild.querySelector('.remove-topic-btn').addEventListener('click', function() {
        this.closest('.topic-item').remove();
    });
}

// --- LOGIC GỌI AI ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const preview = document.getElementById('previewContent');
    const section = document.getElementById('previewSection');
    const loading = document.getElementById('loadingMsg');
    
    // UI Reset
    loading.classList.remove('hidden');
    section.classList.add('hidden');
    preview.innerHTML = "";
    btn.disabled = true;

    try {
        const getData = (id) => document.getElementById(id).value.trim();
        const requestData = {
            license_key: getData('license_key'),
            subject: getData('subject'),
            grade: getData('grade'),
            semester: getData('semester'),
            exam_type: getData('exam_type'),
            time: getData('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(getData('total_half1')) || 0,
            totalPeriodsHalf2: parseInt(getData('total_half2')) || 0,
            topics: []
        };

        document.querySelectorAll('.topic-item').forEach(row => {
            const name = row.querySelector('.topic-name').value;
            const content = row.querySelector('.topic-content').value;
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;
            if(name) requestData.topics.push({name, content, p1, p2});
        });

        if(requestData.topics.length === 0) throw new Error("Nhập ít nhất 1 chủ đề!");

        const response = await fetch('/api_matrix', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });

        if(!response.ok) throw new Error("Lỗi kết nối Server AI");

        section.classList.remove('hidden');
        section.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            let chunk = decoder.decode(value, {stream: true});
            preview.innerHTML += chunk.replace(/```html/g, '').replace(/```/g, '');
        }

    } catch(err) {
        alert("Lỗi: " + err.message);
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
}

// ============================================================
// --- XUẤT WORD CHUYÊN NGHIỆP (LATEX -> MATHML -> OMML) ---
// ============================================================

async function handleDownloadWord() {
    // 1. KIỂM TRA THƯ VIỆN
    if (typeof docx === 'undefined') {
        alert("LỖI MẠNG NGHIÊM TRỌNG: Trình duyệt không thể tải thư viện 'docx'.\n\nHãy thử:\n1. Tắt trình chặn quảng cáo (AdBlock).\n2. Dùng Wifi khác (như 4G).\n3. Nhấn Ctrl + F5 để tải lại.");
        return;
    }
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý Toán học...`;
    btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, TextRun, AlignmentType, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = docx;

        // --- HÀM 1: CHUYỂN ĐỔI XML MATHML SANG DOCX OBJECT ---
        function convertXmlNodeToDocx(node) {
            if (!node) return [];
            const results = [];
            
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text Node
                    if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                    return;
                }
                
                const tag = child.tagName.toLowerCase();
                const kids = convertXmlNodeToDocx(child); // Đệ quy

                switch(tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext':
                        results.push(new MathRun(child.textContent)); break;
                    case 'mfrac':
                        if(kids.length >= 2) results.push(new MathFraction({numerator:[kids[0]], denominator:[kids[1]]})); break;
                    case 'msup':
                        if(kids.length >= 2) results.push(new MathSuperScript({children:[kids[0]], superScript:[kids[1]]})); break;
                    case 'msub':
                        if(kids.length >= 2) results.push(new MathSubScript({children:[kids[0]], subScript:[kids[1]]})); break;
                    case 'msqrt':
                        results.push(new MathRadical({children: kids})); break;
                    case 'mrow':
                        results.push(...kids); break;
                    default:
                        results.push(...kids); break; // Fallback
                }
            });
            return results;
        }

        // --- HÀM 2: PARSE HTML VÀ XỬ LÝ LATEX ---
        function parseContentToRuns(htmlText) {
            // Tách LaTeX $$...$$
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];

            parts.forEach((part, index) => {
                if (index % 2 === 1) { // Đây là LaTeX
                    try {
                        if (typeof temml !== 'undefined') {
                            // Bước A: LaTeX -> MathML XML
                            const mathmlStr = temml.renderToString(part, { xml: true });
                            // Bước B: Parse XML
                            const xmlDoc = new DOMParser().parseFromString(mathmlStr, "text/xml");
                            const root = xmlDoc.getElementsByTagName("math")[0];
                            // Bước C: XML -> Docx Object
                            const mathChildren = convertXmlNodeToDocx(root);
                            runs.push(new MathObj({ children: mathChildren }));
                        } else {
                            // Không có Temml thì in đậm
                            runs.push(new TextRun({ text: part, bold: true, color: "blue" }));
                        }
                    } catch (e) {
                        console.error("Lỗi công thức:", part, e);
                        runs.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "red" }));
                    }
                } else { // Text thường
                    // Xóa tag HTML thừa
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if(cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return runs;
        }

        // --- XỬ LÝ CHÍNH ---
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [];

        // Tiêu đề
        docChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Duyệt từng element HTML
        Array.from(docHTML.body.children).forEach(el => {
            // 1. Tiêu đề H2, H3
            if (['H2', 'H3', 'H4'].includes(el.tagName)) {
                let lvl = HeadingLevel.HEADING_2;
                if(el.tagName === 'H3') lvl = HeadingLevel.HEADING_3;
                docChildren.push(new Paragraph({
                    text: el.innerText,
                    heading: lvl,
                    spacing: { before: 200, after: 100 }
                }));
            }
            // 2. Bảng
            else if (el.tagName === 'TABLE') {
                const tableRows = Array.from(el.querySelectorAll('tr')).map(tr => {
                    const tableCells = Array.from(tr.querySelectorAll('th, td')).map(td => {
                        return new TableCell({
                            children: [new Paragraph({ children: parseContentToRuns(td.innerHTML) })],
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                top: {style: BorderStyle.SINGLE, size: 1},
                                bottom: {style: BorderStyle.SINGLE, size: 1},
                                left: {style: BorderStyle.SINGLE, size: 1},
                                right: {style: BorderStyle.SINGLE, size: 1},
                            }
                        });
                    });
                    return new TableRow({ children: tableCells });
                });
                docChildren.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph({text: ""}));
            }
            // 3. Đoạn văn thường
            else {
                if(el.innerText.trim()) {
                    docChildren.push(new Paragraph({ children: parseContentToRuns(el.innerHTML) }));
                }
            }
        });

        // Tạo và Tải file
        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_AI_Chuan_${Date.now()}.docx`);

    } catch (e) {
        alert("Có lỗi khi tạo file Word: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}
