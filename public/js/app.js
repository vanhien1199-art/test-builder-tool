// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopicRow();

    // 2. Gán sự kiện
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Logic ẩn hiện Học kì
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = document.getElementById('hk-config');
            const topicPeriodInputs = document.querySelectorAll('.hk-period-inputs');

            if (hkConfig) isHK ? hkConfig.classList.remove('hidden') : hkConfig.classList.add('hidden');
            topicPeriodInputs.forEach(el => isHK ? el.classList.remove('hidden') : el.classList.add('hidden'));
        });
        examTypeSelect.dispatchEvent(new Event('change'));
    }
});

// --- CÁC HÀM XỬ LÝ GIAO DIỆN ---

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);

        const examType = document.getElementById('exam_type');
        if (examType && examType.value === 'hk') {
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) hkInputs.classList.remove('hidden');
        }
        
        const newRow = container.lastElementChild;
        const btnRemove = newRow.querySelector('.remove-topic-btn');
        if (btnRemove) btnRemove.addEventListener('click', () => newRow.remove());
    }
}

async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    loading.classList.remove('hidden');
    error.classList.add('hidden');
    previewSection.classList.add('hidden');
    previewContent.innerHTML = "";
    btn.disabled = true;

    try {
        const requestData = {
            license_key: document.getElementById('license_key').value.trim(),
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

        const topicRows = document.querySelectorAll('.topic-item');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;
            if (name && content) requestData.topics.push({ name, content, p1, p2 });
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Lỗi Server (${response.status})`);
        }

        previewSection.classList.remove('hidden');
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullHtml += decoder.decode(value, { stream: true });
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


// --- XUẤT FILE WORD (ỔN ĐỊNH - KHÔNG CẦN TẢI LẠI) ---
// File: public/js/app.js

// ... (Giữ nguyên phần code logic thêm chủ đề/gọi API ở trên) ...
// ... Chỉ thay thế hàm handleDownloadWord và các hàm bổ trợ bên dưới ...

// ============================================================
// --- XUẤT FILE WORD (SỬ DỤNG THƯ VIỆN ONLINE) ---
// ============================================================

async function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    // --- KIỂM TRA THƯ VIỆN ONLINE ---
    // Kiểm tra biến 'docx' có tồn tại không. Nếu không -> Link trong index.html bị lỗi/chặn
    if (typeof docx === 'undefined') {
        alert("LỖI MẠNG: Trình duyệt không thể tải thư viện tạo Word từ máy chủ Online (CDN).\n\nHãy thử:\n1. Kiểm tra kết nối mạng.\n2. Tải lại trang (F5).\n3. Nếu vẫn lỗi, mạng của bạn có thể đang chặn 'cdn.jsdelivr.net'.");
        return;
    }

    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xử lý...`;
    btn.disabled = true;

    try {
        // Destructure các thành phần
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, TextRun, AlignmentType, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = docx;

        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const elements = Array.from(docHTML.body.children);
        const docxChildren = [];

        docxChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Hàm Helper: Chuyển MathML XML -> Docx Object
        function convertMathmlToDocx(mathmlString) {
            const xmlDoc = new DOMParser().parseFromString(mathmlString, "text/xml");
            const rootMath = xmlDoc.getElementsByTagName("math")[0];
            if (!rootMath) return null;

            function traverse(node) {
                if (!node) return [];
                const results = [];
                const childNodes = Array.from(node.childNodes);

                for (const child of childNodes) {
                    if (child.nodeType === 3) { // Text node
                        if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                        continue;
                    }
                    const tagName = child.tagName.toLowerCase();
                    const grandChildren = traverse(child);

                    switch (tagName) {
                        case 'mn': case 'mi': case 'mo': case 'mtext':
                            results.push(new MathRun(child.textContent)); break;
                        case 'mfrac':
                            if (grandChildren.length >= 2) results.push(new MathFraction({ numerator: [grandChildren[0]], denominator: [grandChildren[1]] })); break;
                        case 'msup':
                            if (grandChildren.length >= 2) results.push(new MathSuperScript({ children: [grandChildren[0]], superScript: [grandChildren[1]] })); break;
                        case 'msub':
                            if (grandChildren.length >= 2) results.push(new MathSubScript({ children: [grandChildren[0]], subScript: [grandChildren[1]] })); break;
                        case 'msqrt':
                            results.push(new MathRadical({ children: grandChildren })); break;
                        default:
                            results.push(...grandChildren); break;
                    }
                }
                return results;
            }
            return new MathObj({ children: traverse(rootMath) });
        }

        // Logic duyệt HTML
        for (const el of elements) {
            if (['H2', 'H3', 'H4'].includes(el.tagName)) {
                let level = HeadingLevel.HEADING_2;
                if (el.tagName === 'H3') level = HeadingLevel.HEADING_3;
                
                docxChildren.push(new Paragraph({
                    text: el.innerText,
                    heading: level,
                    spacing: { before: 200, after: 100 }
                }));
            }
            else if (el.tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => {
                    const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
                        return new TableCell({
                            children: parseContent(td.innerHTML),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1 },
                                bottom: { style: BorderStyle.SINGLE, size: 1 },
                                left: { style: BorderStyle.SINGLE, size: 1 },
                                right: { style: BorderStyle.SINGLE, size: 1 },
                            }
                        });
                    });
                    return new TableRow({ children: cells });
                });
                docxChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docxChildren.push(new Paragraph({ text: "" }));
            }
            else {
                if(el.innerText.trim()) docxChildren.push(...parseContent(el.innerHTML));
            }
        }

        // Hàm parse Text + LaTeX
        function parseContent(html) {
            // Tách chuỗi latex $$...$$
            const parts = html.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, idx) => {
                if (idx % 2 === 1) { // Là LaTeX
                    try {
                        if (typeof temml !== 'undefined') {
                            const mml = temml.renderToString(part, { xml: true });
                            const mathObj = convertMathmlToDocx(mml);
                            if (mathObj) runs.push(mathObj);
                            else runs.push(new TextRun({ text: `$$${part}$$`, color: "red" }));
                        } else {
                            // Nếu Temml không tải được thì in đậm text
                            runs.push(new TextRun({ text: `$$${part}$$`, bold: true, color: "blue" }));
                        }
                    } catch (e) {
                        runs.push(new TextRun({ text: `$$${part}$$`, color: "red" }));
                    }
                } else { // Là Text thường
                    const txt = part.replace(/<[^>]*>?/gm, ''); // Xóa thẻ HTML dư
                    if(txt) runs.push(new TextRun(txt));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // Tạo file và lưu
        const doc = new Document({ sections: [{ children: docxChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_AI_${Date.now()}.docx`);

    } catch (e) {
        alert("Có lỗi khi tạo file: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}



