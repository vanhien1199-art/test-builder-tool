// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra ngay khi vào trang
    if (typeof docx === 'undefined') {
        console.error("CẢNH BÁO: File js/docx.js chưa được nạp! Hãy kiểm tra lại file.");
    }

    // Gán sự kiện (Giữ nguyên logic cũ của bạn)
    const el = id => document.getElementById(id);
    if(el('btnAddTopic')) el('btnAddTopic').addEventListener('click', addTopicRow);
    if(el('btnGenerate')) el('btnGenerate').addEventListener('click', handleGenerate);
    if(el('btnDownloadWord')) el('btnDownloadWord').addEventListener('click', handleDownloadWord);
    
    // Init
    addTopicRow();
});

// ... (Giữ nguyên các hàm addTopicRow và handleGenerate của bạn) ...
// ... CHỈ THAY THẾ HÀM handleDownloadWord DƯỚI ĐÂY ...

async function handleDownloadWord() {
    // 1. KIỂM TRA SỐNG CÒN
    if (typeof docx === 'undefined') {
        alert("LỖI NGHIÊM TRỌNG:\nTrình duyệt không tìm thấy thư viện 'docx'.\n\nNguyên nhân: Bạn chưa tải file 'docx.js' vào thư mục 'public/js/' hoặc file bị rỗng.\n\nHãy làm lại BƯỚC 1 theo hướng dẫn.");
        return;
    }
    
    if (!window.generatedHTML) { alert("Chưa có nội dung để xuất!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerHTML;
    btn.innerHTML = "Đang tạo file...";
    btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, TextRun, AlignmentType, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = docx;

        // --- HÀM CHUYỂN XML (MATHML) SANG WORD ---
        function convertXmlToDocx(node) {
            if (!node) return [];
            const res = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text
                    if(child.nodeValue.trim()) res.push(new MathRun(child.nodeValue));
                    return;
                }
                const tag = child.tagName.toLowerCase();
                const kids = convertXmlToDocx(child);
                
                switch(tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext': res.push(new MathRun(child.textContent)); break;
                    case 'mfrac': if(kids.length>=2) res.push(new MathFraction({numerator:[kids[0]], denominator:[kids[1]]})); break;
                    case 'msup': if(kids.length>=2) res.push(new MathSuperScript({children:[kids[0]], superScript:[kids[1]]})); break;
                    case 'msub': if(kids.length>=2) res.push(new MathSubScript({children:[kids[0]], subScript:[kids[1]]})); break;
                    case 'msqrt': res.push(new MathRadical({children: kids})); break;
                    default: res.push(...kids); break;
                }
            });
            return res;
        }

        // --- XỬ LÝ HTML ---
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const children = [];

        children.push(new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }));

        // Hàm nhỏ parse nội dung Text + LaTeX
        const parseRuns = (html) => {
            const parts = html.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, i) => {
                if (i % 2 === 1) { // LaTeX
                    try {
                        if (typeof temml !== 'undefined') {
                            const xmlStr = temml.renderToString(part, { xml: true });
                            const xmlDoc = new DOMParser().parseFromString(xmlStr, "text/xml");
                            runs.push(new MathObj({ children: convertXmlToDocx(xmlDoc.getElementsByTagName("math")[0]) }));
                        } else {
                            runs.push(new TextRun({ text: part, bold: true, color: "blue" }));
                        }
                    } catch (e) { runs.push(new TextRun({ text: `$$${part}$$`, color: "red" })); }
                } else { // Text
                    const txt = part.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ");
                    if(txt) runs.push(new TextRun(txt));
                }
            });
            return runs;
        };

        // Duyệt HTML
        Array.from(docHTML.body.children).forEach(el => {
            if (['H2','H3','H4'].includes(el.tagName)) {
                children.push(new Paragraph({ text: el.innerText, heading: HeadingLevel.HEADING_2, spacing:{before:200, after:100} }));
            } else if (el.tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td,th')).map(td => 
                        new TableCell({ children: [new Paragraph({ children: parseRuns(td.innerHTML) })], width: {size:100, type:WidthType.PERCENTAGE}, borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} }) 
                    )})
                );
                children.push(new Table({ rows: rows, width: {size:100, type:WidthType.PERCENTAGE} }));
                children.push(new Paragraph({text:""}));
            } else {
                if(el.innerText.trim()) children.push(new Paragraph({ children: parseRuns(el.innerHTML) }));
            }
        });

        // Xuất file
        const doc = new Document({ sections: [{ children: children }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Output_${Date.now()}.docx`);

    } catch (e) {
        alert("Lỗi tạo file: " + e.message);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}
