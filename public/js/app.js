// File: public/js/app.js - Final Logic Implementation

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow(); // [cite: 1]

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
            const hkConfig = document.getElementById('hk-config'); // [cite: 2]
            const topicPeriodInputs = document.querySelectorAll('.hk-period-inputs');

            // Ẩn hiện phần tổng tiết chung
            if (hkConfig) {
                if (isHK) hkConfig.classList.remove('hidden'); // [cite: 3]
                else hkConfig.classList.add('hidden');
            }

            // Ẩn hiện phần số tiết con trong từng chủ đề
            topicPeriodInputs.forEach(el => {
                if (isHK) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        });
        // Kích hoạt ngay lần đầu
        examTypeSelect.dispatchEvent(new Event('change')); // [cite: 4]
    }
    
    // Gán sự kiện xóa cho các dòng chủ đề đã có (nếu có)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        if (e.target.closest('.remove-topic-btn')) {
            e.target.closest('.topic-item').remove();
        }
    });
});

// --- HÀM THÊM CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container'); // [cite: 5]
    const template = document.getElementById('topic-template'); // [cite: 5]
    if (container && template) {
        const clone = template.content.cloneNode(true); // [cite: 6]
        container.appendChild(clone); // [cite: 6]

        // Kiểm tra lại trạng thái hiển thị của dòng mới thêm
        const examType = document.getElementById('exam_type'); // [cite: 7]
        if (examType) { // [cite: 8]
            const isHK = examType.value === 'hk';
            const newRow = container.lastElementChild; // Dòng vừa thêm (div.topic-item)
            const hkInputs = newRow.querySelector('.hk-period-inputs'); // [cite: 9]
            if (hkInputs) { // [cite: 10]
                if (isHK) hkInputs.classList.remove('hidden');
                else hkInputs.classList.add('hidden'); // [cite: 10]
            }
        }
    }
}

// --- XỬ LÝ CHÍNH: GỌI API STREAMING ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg'); // [cite: 12]
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent'); // [cite: 12]

    // UI Reset
    loading.classList.remove('hidden'); // [cite: 13]
    error.classList.add('hidden');
    previewSection.classList.add('hidden');
    previewContent.innerHTML = "";
    btn.disabled = true;
    error.innerHTML = ""; // [cite: 13]

    try {
        const licenseKey = document.getElementById('license_key').value.trim(); // [cite: 14]
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!"); // [cite: 14]

        const requestData = { // [cite: 15]
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0, // [cite: 16]
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0, // [cite: 16]
            topics: []
        };

        // Thu thập chủ đề
        const topicRows = document.querySelectorAll('.topic-item'); // [cite: 17]
        topicRows.forEach(row => { // [cite: 18]
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 }); // [cite: 18]
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề."); // [cite: 19]

        // Gọi API
        const response = await fetch('/api_matrix', { // [cite: 20]
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) { // [cite: 21]
            const errText = await response.text();
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error; } catch(e){} // [cite: 22]
            throw new Error(`Lỗi Server (${response.status}): ${errMsg}`); // [cite: 23]
        }

        // Hiện khung Preview
        previewSection.classList.remove('hidden'); // [cite: 23]
        previewSection.scrollIntoView({ behavior: 'smooth' }); // [cite: 23]

        // Đọc Stream (Hứng toàn bộ dữ liệu để tránh lỗi vỡ thẻ HTML)
        const reader = response.body.getReader(); // [cite: 24]
        const decoder = new TextDecoder(); // [cite: 24]
        let fullHtml = ""; // [cite: 24]

        while (true) { // [cite: 25]
            const { done, value } = await reader.read();
            if (done) break; // [cite: 25]

            const chunk = decoder.decode(value, { stream: true }); // [cite: 26]
            fullHtml += chunk;
        }

        // Loại bỏ rác Markdown và cập nhật nội dung sau khi Stream xong 100%
        let cleanHtml = fullHtml.replace(/```html/g, '').replace(/```/g, ''); // [cite: 27]
        
        // Cần lọc bỏ các lời dẫn của AI trước/sau bảng
        const tableMatch = cleanHtml.match(/<table[\s\S]*?<\/table>/i);
        if (tableMatch) {
            cleanHtml = tableMatch[0]; // Giữ lại đúng phần bảng (Ma trận) và nội dung đề
        }
        
        previewContent.innerHTML = cleanHtml; // [cite: 27]

        window.generatedHTML = cleanHtml; // [cite: 28]
        loading.classList.add('hidden'); // [cite: 28]

    } catch (err) {
        error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`; // [cite: 29]
        error.classList.remove('hidden'); // [cite: 29]
        loading.classList.add('hidden'); // [cite: 29]
    } finally {
        btn.disabled = false; // [cite: 30]
    }
}

// ============================================================
// --- LOGIC XUẤT FILE WORD (NATIVE EQUATION) ---
// ============================================================

// Hàm này phải được giữ nguyên để logic docx.js hoạt động
async function handleDownloadWord() {
    if (!window.generatedHTML) { 
        alert("Chưa có nội dung!"); 
        return; // [cite: 31]
    }
    
    // Kiểm tra thư viện (để tránh lỗi)
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong."); 
        return;
    }

    const btn = document.getElementById('btnDownloadWord');
    btn.innerText = "Đang tạo file..."; 
    btn.disabled = true;

    try {
        // Lấy từ biến Global
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;
        
        // Hàm Map Heading Level
        const getHeadingLevel = (tag) => {
            const map = { 'H1': HeadingLevel.HEADING_1, 'H2': HeadingLevel.HEADING_2, 'H3': HeadingLevel.HEADING_3, 'H4': HeadingLevel.HEADING_4, 'H5': HeadingLevel.HEADING_5, 'H6': HeadingLevel.HEADING_6 };
            return map[tag] || HeadingLevel.NORMAL;
        };

        // 1. Hàm đệ quy: XML Node -> Docx Math Object
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue)); return; }
                const tag = child.tagName.toLowerCase();
                const children = convertXmlNode(child);
                
                switch (tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext': results.push(new MathRun(child.textContent)); break;
                    case 'mfrac': if (children.length >= 2) results.push(new MathFraction({ numerator: [children[0]], denominator: [children[1]] })); break;
                    case 'msup': if (children.length >= 2) results.push(new MathSuperScript({ children: [children[0]], superScript: [children[1]] })); break;
                    case 'msqrt': results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': results.push(...children); break;
                    default: results.push(...children); break;
                }
            });
            return results;
        }

        // 2. Parse nội dung (Text + LaTeX)
        function parseContent(htmlText) {
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, index) => {
                if (index % 2 === 1) { // LaTeX
                    try {
                        if (typeof temml !== 'undefined') {
                            const xmlString = temml.renderToString(part, { xml: true });
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                            const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                            const mathChildren = convertXmlNode(mathRoot);
                            runs.push(new MathObj({ children: mathChildren }));
                        } else {
                            // Fallback (Đã fix lỗi Hex Color)
                            runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                        }
                    } catch (e) { 
                        // Lỗi parse
                        runs.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "FF0000" })); 
                    }
                } else { // Text
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // 3. Xây dựng Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [
            new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } })
        ];

        const docBodyChildren = Array.from(docHTML.body.children);
        
        docBodyChildren.forEach(el => {
            const tagName = el.tagName;
            const innerHTML = el.innerHTML;
            
            // 1. Xử lý Tiêu đề (H1, H2, H3...)
            if (tagName.match(/^H[1-6]$/)) {
                docChildren.push(new Paragraph({
                    children: parseContent(innerHTML)[0].root.children,
                    heading: getHeadingLevel(tagName),
                    spacing: { before: 200, after: 100 }
                }));
            } 
            // 2. Xử lý Bảng
            else if (tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpanAttr = td.getAttribute('colspan');
                        const rowSpanAttr = td.getAttribute('rowspan');

                        return new TableCell({ 
                            children: parseContent(td.innerHTML),
                            // Fix lỗi Colspan/Rowspan bị mất
                            columnSpan: colSpanAttr ? parseInt(colSpanAttr) : undefined,
                            rowSpan: rowSpanAttr ? parseInt(rowSpanAttr) : undefined,
                            width: { size: 100, type: WidthType.PERCENTAGE }, 
                            borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} 
                        }); 
                    })})
                );
                docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph(""));
            }
            // 3. Xử lý Đoạn văn (P, DIV, LI - nội dung câu hỏi/đáp án)
            else if (el.innerText.trim()) {
                docChildren.push(...parseContent(innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Full_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerText = "TẢI VỀ WORD (NATIVE EQUATION)";
        btn.disabled = false;
    }
}
