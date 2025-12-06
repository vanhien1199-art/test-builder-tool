/* File: public/css/style.css */

:root {
    --primary: #2563eb;
    --primary-dark: #1d4ed8;
    --secondary: #64748b;
    --success: #16a34a;
    --danger: #dc2626;
    --bg-body: #f1f5f9;
    --bg-card: #ffffff;
    --border: #e2e8f0;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --radius: 12px;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
}

* { 
    box-sizing: border-box; 
    margin: 0; 
    padding: 0; 
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-body);
    color: var(--text-main);
    line-height: 1.5;
    font-size: 15px;
    min-height: 100vh;
}

/* HEADER */
.app-header {
    background: var(--bg-card);
    padding: 1rem 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    position: sticky; 
    top: 0; 
    z-index: 100;
}
.header-content {
    max-width: 900px; 
    margin: 0 auto; 
    padding: 0 20px;
}
.brand { 
    display: flex; 
    align-items: center; 
    gap: 12px; 
}
.logo-icon {
    width: 40px; 
    height: 40px; 
    background: var(--primary);
    color: white; 
    border-radius: 10px; 
    display: flex;
    align-items: center; 
    justify-content: center; 
    font-size: 1.2rem;
}
.brand-text h1 { 
    font-size: 1.25rem; 
    font-weight: 700; 
    color: var(--text-main); 
    margin: 0; 
}
.badge {
    background: #dbeafe; 
    color: var(--primary);
    font-size: 0.75rem; 
    padding: 2px 8px; 
    border-radius: 4px; 
    font-weight: 600;
}

/* MAIN LAYOUT */
.main-container { 
    max-width: 900px; 
    margin: 0 auto; 
    padding: 30px 20px 50px; 
}

.intro-section { 
    text-align: center; 
    margin-bottom: 30px; 
}
.intro-section h2 { 
    font-size: 1.8rem; 
    font-weight: 800; 
    color: var(--text-main); 
    margin-bottom: 0.5rem; 
}
.intro-section p { 
    color: var(--text-muted); 
    font-size: 1rem; 
}

/* CARDS */
.card {
    background: var(--bg-card); 
    border-radius: var(--radius);
    box-shadow: var(--shadow); 
    margin-bottom: 24px; 
    overflow: hidden;
    border: 1px solid var(--border);
}
.card-header {
    padding: 16px 24px; 
    background: #f8fafc; 
    border-bottom: 1px solid var(--border);
    font-weight: 600; 
    color: var(--text-main); 
    font-size: 1.1rem;
    display: flex; 
    align-items: center; 
    gap: 10px;
}
.card-header i { 
    color: var(--primary); 
}
.card-body { 
    padding: 24px; 
}
.success-header { 
    background: #d1fae5; 
    color: #065f46; 
    border-color: #a7f3d0;
}
.success-header i { 
    color: #10b981; 
}

/* GRID SYSTEM */
.grid-2 { 
    display: grid; 
    grid-template-columns: 1fr 1fr; 
    gap: 20px; 
}
.grid-3 { 
    display: grid; 
    grid-template-columns: 1fr 1fr 1fr; 
    gap: 20px; 
}

/* FORMS */
.form-group { 
    margin-bottom: 15px; 
}
.form-group label { 
    display: block; 
    font-weight: 500; 
    margin-bottom: 6px; 
    font-size: 0.95rem; 
}
.form-group label .required {
    color: var(--danger);
    margin-left: 2px;
}
input[type="text"], 
input[type="number"], 
select, 
textarea {
    width: 100%; 
    padding: 10px 12px; 
    border: 1px solid #cbd5e1;
    border-radius: 8px; 
    font-size: 15px; 
    transition: border 0.2s, box-shadow 0.2s;
    font-family: inherit;
    background-color: white;
}
input:focus, 
select:focus, 
textarea:focus {
    border-color: var(--primary); 
    outline: none;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
textarea { 
    resize: vertical; 
    min-height: 60px; 
}
.form-group.mini { 
    margin-bottom: 8px; 
}
.form-group.mini label { 
    font-size: 0.85rem; 
    color: var(--text-muted); 
}

/* TOPIC ITEM */
.topic-item {
    background: #f8fafc; 
    border: 1px solid var(--border);
    border-radius: 8px; 
    padding: 16px; 
    margin-bottom: 16px;
    position: relative; 
}
.topic-item:hover { 
    border-color: #cbd5e1; 
}
.topic-header { 
    display: flex; 
    justify-content: space-between; 
    align-items: center;
    margin-bottom: 10px; 
    font-size: 0.85rem; 
    font-weight: 600; 
    color: var(--text-muted); 
    text-transform: uppercase; 
    letter-spacing: 0.5px; 
}
.topic-label { 
    font-size: 0.9rem; 
}
.btn-icon-danger { 
    background: none; 
    border: none; 
    color: #ef4444; 
    cursor: pointer; 
    padding: 4px 8px; 
    font-size: 1rem; 
    opacity: 0.7;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}
.btn-icon-danger:hover { 
    opacity: 1; 
    background: rgba(239, 68, 68, 0.1);
}

/* BUTTONS */
.btn {
    display: inline-flex; 
    align-items: center; 
    justify-content: center;
    padding: 12px 24px; 
    border-radius: 8px; 
    font-weight: 600; 
    cursor: pointer;
    transition: all 0.2s; 
    border: none; 
    font-size: 1rem; 
    gap: 8px;
    text-decoration: none;
    user-select: none;
}
.btn-primary { 
    background: var(--primary); 
    color: white; 
    width: 100%; 
}
.btn-primary:hover { 
    background: var(--primary-dark); 
    transform: translateY(-1px); 
}
.btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
    transform: none;
}
.btn-outline { 
    background: white; 
    border: 1px dashed #cbd5e1; 
    color: var(--text-muted); 
    width: 100%; 
}
.btn-outline:hover { 
    border-color: var(--primary); 
    color: var(--primary); 
    background: #f0f9ff; 
}
.btn-success { 
    background: var(--success); 
    color: white; 
}
.btn-success:hover { 
    background: #15803d; 
    transform: translateY(-1px); 
}
.btn-lg { 
    min-height: 56px; 
    font-size: 1.1rem; 
    padding: 0 30px; 
}

/* LICENSE CARD */
.license-card {
    background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
    border: 2px solid #bfdbfe; 
    border-radius: var(--radius);
    padding: 20px; 
    margin-bottom: 30px;
    display: flex; 
    align-items: center; 
    gap: 20px;
}
.license-icon {
    width: 50px; 
    height: 50px; 
    background: #dbeafe; 
    color: var(--primary);
    border-radius: 50%; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    font-size: 1.5rem;
    flex-shrink: 0;
}
.license-input { 
    flex: 1; 
}
.license-input label { 
    display: block; 
    font-weight: 600; 
    margin-bottom: 8px; 
    color: var(--primary);
    font-size: 0.95rem;
}
.license-input input {
    font-family: 'Courier New', monospace; 
    font-size: 1.1rem; 
    font-weight: 600;
    text-align: center; 
    color: var(--primary-dark); 
    letter-spacing: 1px;
    border-color: #60a5fa; 
    height: 48px;
    background: white;
}

/* UTILS */
.hidden { 
    display: none !important; 
}
.highlight-box {
    background: #fff7ed; 
    border: 1px dashed #fdba74; 
    padding: 16px;
    border-radius: 8px; 
    margin-top: 15px;
}
.box-title { 
    font-weight: 600; 
    color: #c2410c; 
    margin-bottom: 12px; 
    font-size: 0.9rem; 
}

/* LOADING & ERROR */
.loading-state { 
    text-align: center; 
    margin: 20px 0; 
    color: var(--text-muted);
    padding: 20px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid var(--border);
}
.spinner {
    width: 30px; 
    height: 30px; 
    border: 3px solid #e2e8f0;
    border-top-color: var(--primary); 
    border-radius: 50%;
    margin: 0 auto 15px; 
    animation: spin 1s linear infinite;
}
@keyframes spin { 
    to { 
        transform: rotate(360deg); 
    } 
}

.error-box {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 15px 20px;
    margin: 20px 0;
    color: #dc2626;
    font-weight: 500;
}
.error-box i { 
    margin-right: 10px; 
}

/* PREVIEW SECTION */
.preview-card { 
    margin-top: 30px; 
}
.preview-scroll-area {
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: white;
}
.preview-content {
    font-family: "Times New Roman", serif;
    padding: 25px;
    font-size: 14pt;
    line-height: 1.5;
    min-height: 200px;
}

/* Công thức trong preview */
.preview-content sub {
    vertical-align: sub;
    font-size: 0.8em;
}

.preview-content sup {
    vertical-align: super;
    font-size: 0.8em;
}

.preview-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    border: 1px solid #000;
}

.preview-content th,
.preview-content td {
    border: 1px solid #000;
    padding: 8px;
    text-align: left;
    vertical-align: top;
}

.preview-content th {
    background-color: #f2f2f2;
    font-weight: bold;
    text-align: center;
}

.preview-content h2,
.preview-content h3 {
    text-align: center;
    margin: 25px 0 15px;
    color: #000;
    font-weight: bold;
}

.preview-footer {
    margin-top: 25px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center;
}

/* ACTION AREA */
.action-area {
    margin: 40px 0;
    text-align: center;
}

/* FOOTER */
.app-footer {
    text-align: center;
    padding: 20px;
    color: var(--text-muted);
    font-size: 0.9rem;
    border-top: 1px solid var(--border);
    margin-top: 40px;
}

/* CHECKBOX CUSTOM */
.checkbox-group { 
    margin-top: 15px; 
}
.custom-checkbox {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 500;
}
.custom-checkbox input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
}
.checkmark {
    position: relative;
    height: 20px;
    width: 20px;
    background-color: white;
    border: 2px solid #cbd5e1;
    border-radius: 4px;
    margin-right: 10px;
    transition: all 0.2s;
    flex-shrink: 0;
}
.custom-checkbox:hover input ~ .checkmark {
    border-color: var(--primary);
}
.custom-checkbox input:checked ~ .checkmark {
    background-color: var(--primary);
    border-color: var(--primary);
}
.checkmark:after {
    content: "";
    position: absolute;
    display: none;
    left: 6px;
    top: 2px;
    width: 5px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
}
.custom-checkbox input:checked ~ .checkmark:after {
    display: block;
}
.label-text { 
    font-size: 0.95rem; 
    line-height: 1.4;
}

/* RESPONSIVE */
@media (max-width: 768px) {
    .grid-2, .grid-3 { 
        grid-template-columns: 1fr; 
    }
    .license-card { 
        flex-direction: column; 
        text-align: center; 
        gap: 15px;
    }
    .main-container { 
        padding: 20px 15px; 
    }
    .card-body { 
        padding: 20px; 
    }
    .preview-scroll-area { 
        max-height: 400px; 
    }
    .btn-lg { 
        min-height: 50px; 
        font-size: 1rem; 
        padding: 0 20px; 
    }
    .intro-section h2 { 
        font-size: 1.5rem; 
    }
}

@media (max-width: 480px) {
    .card-header { 
        padding: 12px 16px; 
        font-size: 1rem; 
    }
    .preview-content { 
        padding: 15px; 
        font-size: 12pt; 
    }
    .license-input input {
        font-size: 1rem;
        height: 44px;
    }
}
