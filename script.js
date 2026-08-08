"use strict";
// Nomes das perícias sem '+' e '*'
const skillsData = [
    { name: "Acrobacia", attr: "AGI" },
    { name: "Adestramento", attr: "PRE" },
    { name: "Artes", attr: "PRE" },
    { name: "Atletismo", attr: "FOR" },
    { name: "Atualidades", attr: "INT" },
    { name: "Ciências", attr: "INT" },
    { name: "Crime", attr: "AGI" },
    { name: "Diplomacia", attr: "PRE" },
    { name: "Enganação", attr: "PRE" },
    { name: "Fortitude", attr: "VIG" },
    { name: "Furtividade", attr: "AGI" },
    { name: "Iniciativa", attr: "AGI" },
    { name: "Intimidação", attr: "PRE" },
    { name: "Intuição", attr: "PRE" },
    { name: "Investigação", attr: "INT" },
    { name: "Luta", attr: "FOR" },
    { name: "Medicina", attr: "INT" },
    { name: "Ocultismo", attr: "INT" },
    { name: "Percepção", attr: "PRE" },
    { name: "Pilotagem", attr: "AGI" },
    { name: "Pontaria", attr: "AGI" },
    { name: "Profissão", attr: "INT" },
    { name: "Reflexos", attr: "AGI" },
    { name: "Religião", attr: "PRE" },
    { name: "Sobrevivência", attr: "INT" },
    { name: "Tática", attr: "INT" },
    { name: "Tecnologia", attr: "INT" },
    { name: "Vontade", attr: "PRE" }
];
let isStatusEditMode = false;
let soundsMuted = false;
let editingAttack = null;
let editingAbility = null;
let authMode = 'login';
let authToken = localStorage.getItem('ficha-auth-token') || '';
let currentUser = null;
const apiOrigin = window.API_BASE_URL || (window.location.protocol === 'file:' || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000') ? 'http://localhost:3000' : '');
const apiUrl = path => `${apiOrigin}${path}`;
const classEvolutions = {
    Fortalecedor: ['Guerreiro', 'Assassino', 'Tank'],
    Preciso: ['Atirador', 'Lançador', 'Caçador'],
    Fluido: ['Mago', 'Invocador', 'Produtor', 'Harmonizador']
};
const classBenefits = {
    Fortalecedor: {
        hp: 5, san: 1, ea: 2,
        fixed: [],
        groups: [['Luta', 'Furtividade'], ['Fortitude', 'Reflexos']]
    },
    Preciso: {
        hp: 3, san: 3, ea: 2,
        fixed: ['Pontaria'],
        groups: [['Reflexos', 'Percepção'], skillsData.map(skill => skill.name)]
    },
    Fluido: {
        hp: 2, san: 3, ea: 3,
        fixed: ['Ocultismo'],
        groups: [['Ciências', 'Religião'], skillsData.map(skill => skill.name)]
    }
};
function getPrimaryClass() {
    const select = document.getElementById('char-class-primary');
    if (!select)
        return '';
    return Object.keys(classBenefits).includes(select.dataset.primary) ? select.dataset.primary : select.value;
}
function getClassBenefit(primary = getPrimaryClass()) {
    return classBenefits[primary] || { hp: 0, san: 0, ea: 0, fixed: [], groups: [] };
}
function getClassChoice(id, fallback = '') {
    return document.getElementById(id)?.value || fallback;
}
function renderClassBenefitsPanel(primary) {
    const menu = document.getElementById('class-picker-menu');
    const benefit = getClassBenefit(primary);
    if (!menu || !primary || !classBenefits[primary])
        return;
    let panel = document.getElementById('class-benefits-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'class-benefits-panel';
        panel.className = 'class-benefits-panel';
        menu.appendChild(panel);
    }
    const selectOptions = (values, selected) => values.map(skill => `<option value="${skill}" ${skill === selected ? 'selected' : ''}>${skill} +2</option>`).join('');
    const savedChoices = benefit.groups.map((_, index) => getClassChoice(`class-choice-${index}`));
    panel.innerHTML = `
            <div class="class-benefits-title">Benefícios de ${primary}</div>
            <div class="class-benefits-summary">Vida +${benefit.hp} | Sanidade +${benefit.san} | EA +${benefit.ea}</div>
            ${benefit.fixed.length ? `<div class="class-benefits-fixed">Perícia garantida: ${benefit.fixed.map(skill => `${skill} +2`).join(', ')}</div>` : ''}
            ${benefit.groups.map((group, index) => `
                <label class="class-benefit-choice">Escolha uma perícia +2:
                    <select id="class-choice-${index}" onchange="applyClassBenefits()">
                        <option value="">Selecionar</option>
                        ${selectOptions(group, savedChoices[index])}
                    </select>
                </label>
            `).join('')}
        `;
}
function applyClassBenefits() {
    const primary = getPrimaryClass();
    const benefit = getClassBenefit(primary);
    const classBonusBySkill = {};
    benefit.fixed.forEach(skill => classBonusBySkill[skill] = (classBonusBySkill[skill] || 0) + 2);
    benefit.groups.forEach((_, index) => {
        const selected = getClassChoice(`class-choice-${index}`);
        if (selected)
            classBonusBySkill[selected] = (classBonusBySkill[selected] || 0) + 2;
    });
    skillsData.forEach((skill, index) => {
        const input = document.getElementById(`skill-outros-${index}`);
        input.dataset.classBonus = String(classBonusBySkill[skill.name] || 0);
        updateSkill(index);
    });
    const allChoicesSelected = benefit.groups.every((_, index) => getClassChoice(`class-choice-${index}`));
    if (allChoicesSelected)
        closeClassMenu();
    calculateSheet(true);
}
function updateClassSelection() {
    const primarySelect = document.getElementById('char-class-primary');
    const evolutionSelect = document.getElementById('char-class-evolution');
    const classInput = document.getElementById('char-class');
    if (!primarySelect || !evolutionSelect || !classInput)
        return;
    const selectedClass = primarySelect.value;
    const primary = primarySelect.dataset.primary || selectedClass;
    const evolution = classEvolutions[primary]?.includes(selectedClass) ? selectedClass : '';
    primarySelect.dataset.primary = primary;
    evolutionSelect.value = evolution;
    classInput.value = selectedClass;
    const trigger = document.getElementById('class-picker-trigger');
    if (trigger)
        trigger.innerText = selectedClass || 'Selecionar';
}
function renderClassMenu(showEvolutions = false) {
    const grid = document.getElementById('class-picker-grid');
    const title = document.getElementById('class-picker-title');
    const primarySelect = document.getElementById('char-class-primary');
    if (!grid || !title || !primarySelect)
        return;
    const primary = primarySelect.dataset.primary || primarySelect.value;
    const classes = showEvolutions ? (classEvolutions[primary] || []) : Object.keys(classEvolutions);
    title.innerText = showEvolutions ? `Escolha a evolução de ${primary}` : 'Escolha sua classe';
    grid.innerHTML = '';
    classes.forEach(className => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'class-picker-card';
        card.innerText = className;
        card.onclick = event => {
            event.stopPropagation();
            chooseClass(className, showEvolutions);
        };
        grid.appendChild(card);
    });
    if (!showEvolutions)
        renderClassBenefitsPanel(primary);
}
function toggleClassMenu(event, showEvolutions = false) {
    event.stopPropagation();
    const menu = document.getElementById('class-picker-menu');
    if (!menu)
        return;
    renderClassMenu(showEvolutions);
    menu.classList.toggle('open');
}
function closeClassMenu(event) {
    if (event)
        event.stopPropagation();
    document.getElementById('class-picker-menu')?.classList.remove('open');
}
function chooseClass(className, isEvolution) {
    const primarySelect = document.getElementById('char-class-primary');
    if (isEvolution) {
        primarySelect.value = className;
    }
    else {
        document.querySelectorAll('[id^="class-choice-"]').forEach(choice => choice.value = '');
        primarySelect.dataset.primary = className;
        primarySelect.value = className;
    }
    updateClassEvolutionOptions();
    renderClassMenu(false);
    applyClassBenefits();
}
function updateClassEvolutionOptions() {
    const level = parseInt(document.getElementById('char-level').value, 10) || 0;
    const primarySelect = document.getElementById('char-class-primary');
    const evolutionSelect = document.getElementById('char-class-evolution');
    const evolutionButton = document.getElementById('class-evolution-btn');
    if (!primarySelect || !evolutionSelect || !evolutionButton)
        return;
    const selectedClass = primarySelect.value;
    const primary = Object.keys(classEvolutions).includes(selectedClass) ? selectedClass : primarySelect.dataset.primary || Object.keys(classEvolutions).find(className => className === selectedClass || classEvolutions[className].includes(selectedClass)) || selectedClass;
    const canEvolve = level >= 5 && Boolean(primary);
    const selectedEvolution = classEvolutions[primary]?.includes(selectedClass) ? selectedClass : '';
    primarySelect.innerHTML = '<option value="">Selecionar</option>';
    Object.keys(classEvolutions).forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.innerText = className;
        primarySelect.appendChild(option);
    });
    if (canEvolve) {
        const evolutionGroup = document.createElement('optgroup');
        evolutionGroup.label = 'Evoluções';
        classEvolutions[primary].forEach(evolution => {
            const option = document.createElement('option');
            option.value = evolution;
            option.innerText = evolution;
            evolutionGroup.appendChild(option);
        });
        primarySelect.appendChild(evolutionGroup);
    }
    primarySelect.dataset.primary = primary;
    primarySelect.value = canEvolve && selectedEvolution ? selectedEvolution : primary;
    evolutionButton.classList.toggle('visible', canEvolve && !selectedEvolution);
    evolutionSelect.value = canEvolve ? selectedEvolution : '';
    updateClassSelection();
}
function toggleClassEvolution(event) {
    event.stopPropagation();
    if (evolutionButtonIsVisible())
        toggleClassMenu(event, true);
}
function evolutionButtonIsVisible() {
    return document.getElementById('class-evolution-btn')?.classList.contains('visible');
}
function renderSkills() {
    const container = document.getElementById('skills-container');
    if (container.children.length > 0)
        return;
    container.innerHTML = '';
    skillsData.forEach((skill, index) => {
        const treinoVal = 0;
        const outrosVal = 0;
        const bonusVal = 0;
        const row = document.createElement('div');
        row.className = 'skill-row';
        row.id = `skill-row-${index}`;
        row.innerHTML = `
                <div class="skill-name-container" onclick="rollSkill('${skill.name}', '${skill.attr}', ${index})">
                    <svg class="skill-icon" viewBox="0 0 24 24" fill="none" stroke-width="2">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
                    </svg>
                    <span class="skill-name">${skill.name}</span>
                </div>
                <span class="skill-attr-tag" onclick="rollSkill('${skill.name}', '${skill.attr}', ${index})">( ${skill.attr} )</span>
                <span class="skill-bonus-tag" id="skill-bonus-${index}" onclick="rollSkill('${skill.name}', '${skill.attr}', ${index})">( ${bonusVal} )</span>
                
                <div class="treino-container" id="treino-container-${index}">
                    <div class="treino-display" id="skill-treino-display-${index}" onclick="toggleTreinoMenu(event, ${index})">${treinoVal}</div>
                    <div class="treino-menu" id="treino-menu-${index}">
                        <div class="treino-option" onclick="selectTreino(${index}, 0)">0</div>
                        <div class="treino-option" onclick="selectTreino(${index}, 2)">2</div>
                        <div class="treino-option" onclick="selectTreino(${index}, 5)">5</div>
                        <div class="treino-option" onclick="selectTreino(${index}, 7)">7</div>
                        <div class="treino-option" onclick="selectTreino(${index}, 10)">10</div>
                    </div>
                    <input type="hidden" id="skill-treino-${index}" value="${treinoVal}">
                </div>

                <input type="number" class="skill-input-underline" id="skill-outros-${index}" value="${outrosVal}" oninput="updateSkill(${index})">
            `;
        container.appendChild(row);
    });
}
function toggleTreinoMenu(event, index) {
    event.stopPropagation();
    document.querySelectorAll('.treino-container').forEach((el, i) => {
        if (i !== index)
            el.classList.remove('active');
    });
    const container = document.getElementById(`treino-container-${index}`);
    container.classList.toggle('active');
}
function selectTreino(index, value) {
    const inputEl = document.getElementById(`skill-treino-${index}`);
    const displayEl = document.getElementById(`skill-treino-display-${index}`);
    inputEl.value = value;
    displayEl.innerText = value;
    const container = document.getElementById(`treino-container-${index}`);
    container.classList.remove('active');
    updateSkill(index);
}
function toggleDamageTypeMenu(event) {
    event.stopPropagation();
    document.getElementById('damage-type-container').classList.toggle('active');
}
function selectDamageType(value) {
    const inputEl = document.getElementById('attack-type');
    const displayEl = document.getElementById('damage-type-display');
    inputEl.value = value;
    displayEl.innerText = value || 'Selecionar';
    displayEl.classList.toggle('selected', Boolean(value));
    document.getElementById('damage-type-container').classList.remove('active');
}
function renderAttackSelectors() {
    createAttackSelector('attack-range', ['Curto', 'Médio', 'Longo', 'Extremo', 'Ilimitado']);
    createAttackSelector('attack-skill', skillsData.map(skill => skill.name));
    createAttackSelector('attack-attribute', ['FOR', 'VIG', 'AGI', 'INT', 'PRE']);
}
function createAttackSelector(id, values) {
    const inputEl = document.getElementById(id);
    const displayEl = document.getElementById(`${id}-display`);
    const menuEl = document.getElementById(`${id}-menu`);
    const currentValue = inputEl.value;
    menuEl.innerHTML = '';
    values.forEach(value => {
        const option = document.createElement('div');
        option.className = 'attack-selector-option';
        option.innerText = value;
        option.onclick = () => selectAttackValue(id, value);
        menuEl.appendChild(option);
    });
    if (currentValue) {
        displayEl.innerText = currentValue;
        displayEl.classList.add('selected');
    }
}
function toggleAttackSelector(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.attack-selector-container').forEach(container => {
        if (container.id !== `${id}-container`)
            container.classList.remove('active');
    });
    document.getElementById(`${id}-container`).classList.toggle('active');
}
function selectAttackValue(id, value) {
    const inputEl = document.getElementById(id);
    const displayEl = document.getElementById(`${id}-display`);
    inputEl.value = value;
    displayEl.innerText = value || 'Selecionar';
    displayEl.classList.toggle('selected', Boolean(value));
    document.getElementById(`${id}-container`).classList.remove('active');
}
document.addEventListener('click', function (e) {
    if (!e.target.closest('.settings-panel') && !e.target.closest('.settings-action')) {
        document.getElementById('settings-panel').classList.remove('open');
    }
    if (!e.target.closest('.treino-container')) {
        document.querySelectorAll('.treino-container').forEach(el => el.classList.remove('active'));
    }
    if (!e.target.closest('.damage-type-container')) {
        document.getElementById('damage-type-container').classList.remove('active');
    }
    if (!e.target.closest('.attack-selector-container')) {
        document.querySelectorAll('.attack-selector-container').forEach(container => container.classList.remove('active'));
    }
    if (!e.target.closest('.class-selector')) {
        document.getElementById('class-picker-menu')?.classList.remove('open');
    }
});
function updateSkill(index) {
    const treino = parseInt(document.getElementById(`skill-treino-${index}`).value) || 0;
    const outros = parseInt(document.getElementById(`skill-outros-${index}`).value) || 0;
    const classBonus = parseInt(document.getElementById(`skill-outros-${index}`).dataset.classBonus) || 0;
    const bonus = treino + outros + classBonus;
    document.getElementById(`skill-bonus-${index}`).innerText = `( ${bonus} )`;
    const row = document.getElementById(`skill-row-${index}`);
    row.classList.remove('skill-level-2', 'skill-level-5', 'skill-level-7', 'skill-level-10');
    if ([2, 5, 7, 10].includes(treino)) {
        row.classList.add(`skill-level-${treino}`);
    }
    if (bonus > 0) {
        row.classList.add('trained');
    }
    else {
        row.classList.remove('trained');
    }
}
function toggleStatusEdit() {
    isStatusEditMode = !isStatusEditMode;
    const btn = document.getElementById('edit-status-btn');
    const attrInputs = document.querySelectorAll('.attr-box input');
    if (isStatusEditMode) {
        btn.classList.add('active');
        attrInputs.forEach(input => {
            input.removeAttribute('readonly');
            input.classList.add('editable');
        });
    }
    else {
        btn.classList.remove('active');
        attrInputs.forEach(input => {
            input.setAttribute('readonly', 'true');
            input.classList.remove('editable');
        });
    }
}
function handleAttrClick(attrName, inputId) {
    if (isStatusEditMode)
        return;
    const rawVal = parseInt(document.getElementById(inputId).value) || 0;
    const bonus = rawVal * 2;
    rollD20(attrName, bonus, `D20 + (${rawVal} x 2)`);
}
function rollSkill(skillName, attrCode, index) {
    const attrMap = { 'FOR': 'attr-for', 'VIG': 'attr-vigor', 'AGI': 'attr-agi', 'INT': 'attr-int', 'PRE': 'attr-pre' };
    const attrInputId = attrMap[attrCode];
    const rawAttrVal = parseInt(document.getElementById(attrInputId).value) || 0;
    const attrBonus = rawAttrVal * 2;
    const treino = parseInt(document.getElementById(`skill-treino-${index}`).value) || 0;
    const outros = parseInt(document.getElementById(`skill-outros-${index}`).value) || 0;
    const skillBonus = treino + outros;
    const totalBonus = attrBonus + skillBonus;
    rollD20(`${skillName} (${attrCode})`, totalBonus, `D20 + Atributo (${attrBonus}) + Bônus (${skillBonus})`);
}
function rollD20(title, bonus, detailText) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + bonus;
    showDiceResult(title, `D20: [${d20}] | ${detailText}`, total);
}
function closeModal(id) {
    if (id) {
        document.getElementById(id).style.display = 'none';
        return;
    }
    document.getElementById('dice-modal').classList.remove('show');
}
function calculateSheet(refillVitals = false) {
    ['attr-for', 'attr-vigor', 'attr-agi', 'attr-int', 'attr-pre'].forEach(id => {
        const input = document.getElementById(id);
        const value = parseInt(input.value, 10);
        if (value > 5)
            input.value = '5';
    });
    const agi = parseInt(document.getElementById('attr-agi').value) || 0;
    const vigor = parseInt(document.getElementById('attr-vigor').value) || 0;
    const presence = parseInt(document.getElementById('attr-pre').value) || 0;
    const level = parseInt(document.getElementById('char-level').value) || 0;
    updateClassEvolutionOptions();
    renderClassMenu(false);
    const classBenefit = getClassBenefit();
    const hpOther = parseInt(document.getElementById('hp-other').value) || 0;
    const sanOther = parseInt(document.getElementById('san-other').value) || 0;
    const eaOther = parseInt(document.getElementById('ea-other').value) || 0;
    const equip = parseInt(document.getElementById('def-equip').value) || 0;
    const outros = parseInt(document.getElementById('def-outros').value) || 0;
    const totalDef = 10 + agi + equip + outros;
    document.getElementById('hp-max').value = String(10 + (vigor * 5) + hpOther + classBenefit.hp);
    document.getElementById('san-max').value = String(8 + (presence * 3) + sanOther + classBenefit.san);
    document.getElementById('ea-max').value = String(5 + (level * 2) + eaOther + classBenefit.ea);
    ['hp', 'san', 'ea'].forEach(type => {
        const currentInput = document.getElementById(`${type}-cur`);
        if (refillVitals || currentInput.value === '') {
            currentInput.value = document.getElementById(`${type}-max`).value;
        }
    });
    document.getElementById('def-total').innerText = String(totalDef);
    document.getElementById('def-esquiva').innerText = String(totalDef);
    updateBars();
}
function updateBars() {
    const types = ['hp', 'san', 'ea'];
    types.forEach(type => {
        const cur = parseFloat(document.getElementById(`${type}-cur`).value) || 0;
        const max = parseFloat(document.getElementById(`${type}-max`).value) || 0;
        const fillEl = document.getElementById(`${type}-fill`);
        let percentage = max > 0 ? (cur / max) * 100 : (cur > 0 ? 100 : 0);
        percentage = Math.min(Math.max(percentage, 0), 100);
        fillEl.style.width = percentage + '%';
    });
}
function adjustVital(type, amount) {
    const curInput = document.getElementById(`${type}-cur`);
    let current = parseInt(curInput.value) || 0;
    current = Math.max(0, current + amount);
    curInput.value = String(current);
    updateBars();
}
function loadAvatar(event) {
    const frame = document.getElementById('avatar-frame');
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            frame.style.backgroundImage = `url('${e.target.result}')`;
            frame.innerHTML = '';
        };
        reader.readAsDataURL(file);
    }
}
/* SISTEMA DAS ABAS */
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.toLowerCase() === tabName.toLowerCase());
    if (targetBtn)
        targetBtn.classList.add('active');
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent)
        targetContent.classList.add('active');
}
function handleDiceKeyDown(event) {
    if (event.key === 'Enter') {
        rollCustomDiceInput();
    }
}
function rollCustomDiceInput() {
    const input = document.getElementById('dice-custom-input');
    const query = input.value.trim();
    if (!query) {
        rollD20("ROLAGEM", 0, "D20 simples");
        return;
    }
    const match = query.match(/^(\d+)?d(\d+)(?:\+|-)?(\d+)?$/i);
    if (match) {
        const numDice = parseInt(match[1]) || 1;
        const dieSides = parseInt(match[2]) || 20;
        const bonus = parseInt(match[3]) || 0;
        let rolls = [];
        let sum = 0;
        for (let i = 0; i < numDice; i++) {
            const r = Math.floor(Math.random() * dieSides) + 1;
            rolls.push(r);
            sum += r;
        }
        const total = sum + bonus;
        showDiceResult(`ROLAGEM (${query.toUpperCase()})`, `Dados: [${rolls.join(', ')}] ${bonus ? '+ ' + bonus : ''}`, total);
    }
    else {
        rollD20(query.toUpperCase(), 0, "Rolagem Direta");
    }
}
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function rollDiceExpression(expression, diceMultiplier = 1) {
    const normalized = expression.trim().replace(/\s+/g, '');
    const match = normalized.match(/^(\d+)?d(\d+)([+-]\d+)?$/i);
    if (!match) {
        if (/^[+-]?\d+$/.test(normalized)) {
            return { rolls: [], diceTotal: 0, bonus: parseInt(normalized, 10), total: parseInt(normalized, 10) };
        }
        return null;
    }
    const diceCount = (parseInt(match[1], 10) || 1) * Math.max(1, diceMultiplier);
    const dieSides = parseInt(match[2], 10);
    const bonus = parseInt(match[3], 10) || 0;
    const rolls = [];
    let diceTotal = 0;
    for (let index = 0; index < diceCount; index++) {
        const roll = Math.floor(Math.random() * dieSides) + 1;
        rolls.push(roll);
        diceTotal += roll;
    }
    return { rolls, diceTotal, bonus, total: diceTotal + bonus };
}
function showDiceResult(title, details, total, soundType = '') {
    playDiceSound();
    if (soundType)
        playAttackSound(soundType);
    document.getElementById('modal-title').innerText = title.toUpperCase();
    document.getElementById('modal-details').innerText = details;
    document.getElementById('modal-total').innerText = total;
    addHistoryEntry(title, details, total);
    const modal = document.getElementById('dice-modal');
    modal.classList.add('show');
    clearTimeout(window.diceTimeout);
    window.diceTimeout = setTimeout(closeModal, 5000);
}
function toggleSettings(event) {
    event.stopPropagation();
    document.getElementById('settings-panel').classList.toggle('open');
}
function openAuthModal() {
    if (authToken) {
        return openAccountMenu();
    }
    setAuthMode('login');
    document.getElementById('auth-modal').style.display = 'flex';
}
function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('auth-feedback').innerText = '';
}
function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('auth-title').innerText = mode === 'login' ? 'Entrar na conta' : 'Criar conta';
    document.getElementById('auth-submit-btn').innerText = mode === 'login' ? 'Entrar' : 'Registrar';
    document.getElementById('login-tab').classList.toggle('active', mode === 'login');
    document.getElementById('register-tab').classList.toggle('active', mode === 'register');
    document.getElementById('auth-feedback').innerText = '';
}
async function submitAuth(event) {
    event.preventDefault();
    const feedback = document.getElementById('auth-feedback');
    feedback.innerText = 'Aguarde...';
    try {
        const response = await fetch(apiUrl(`/api/${authMode}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: document.getElementById('auth-identifier').value, password: document.getElementById('auth-password').value })
        });
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Abra a ficha pelo endereço http://localhost:3000 para usar o login.');
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível autenticar.');
        authToken = result.token;
        localStorage.setItem('ficha-auth-token', authToken);
        updateAuthButton(result.user);
        closeAuthModal();
        alert('Login realizado. Suas fichas agora podem ser salvas na conta.');
    } catch (error) {
        feedback.innerText = error.message || 'Não foi possível conectar ao servidor.';
    }
}
async function logout() {
    try { await fetch(apiUrl('/api/logout'), { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }); } catch (error) { /* sessão local ainda pode ser encerrada */ }
    authToken = '';
    currentUser = null;
    localStorage.removeItem('ficha-auth-token');
    updateAuthButton();
}
function updateAuthButton(user) {
    const button = document.getElementById('login-btn');
    const adminButton = document.getElementById('admin-users-btn');
    if (!button) return;
    button.innerText = user?.username || user?.email?.split('@')[0] || (authToken ? 'Conta' : 'Login');
    if (user) currentUser = user;
    button.title = authToken ? 'Sair da conta' : 'Entrar';
    if (adminButton) adminButton.hidden = user?.role !== 'admin';
}
function openAccountMenu() {
    if (!authToken) return openAuthModal();
    const modal = document.getElementById('account-modal');
    if (!modal) return;
    document.getElementById('account-title').innerText = `Conta: ${currentUser?.username || currentUser?.email || 'usuário'}`;
    document.getElementById('account-feedback').innerText = '';
    modal.style.display = 'flex';
    loadAccountSheets();
}
function closeAccountMenu() {
    document.getElementById('account-modal').style.display = 'none';
}
async function loadAccountSheets() {
    const list = document.getElementById('saved-sheet-list');
    const feedback = document.getElementById('account-feedback');
    if (!list) return;
    list.innerHTML = '<p class="history-empty">Carregando fichas...</p>';
    try {
        const response = await fetch(apiUrl('/api/sheets'), { headers: { Authorization: `Bearer ${authToken}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as fichas.');
        list.innerHTML = result.sheets.map(sheet => `
            <div class="saved-sheet-row">
                <div><strong>${escapeAdminText(sheet.name)}</strong><small>Atualizada em ${escapeAdminText(new Date(sheet.updatedAt).toLocaleString('pt-BR'))}</small></div>
                <button type="button" onclick="loadSavedAccountSheet('${escapeAdminText(sheet.id)}')">Carregar</button>
            </div>`).join('') || '<p class="history-empty">Nenhuma ficha salva nesta conta.</p>';
    } catch (error) {
        feedback.innerText = error.message || 'Não foi possível carregar as fichas.';
        list.innerHTML = '';
    }
}
async function loadSavedAccountSheet(sheetId) {
    const feedback = document.getElementById('account-feedback');
    try {
        const response = await fetch(apiUrl(`/api/sheets/${encodeURIComponent(sheetId)}`), { headers: { Authorization: `Bearer ${authToken}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a ficha.');
        restoreSheetData(result.sheet);
        closeAccountMenu();
        feedback.innerText = `Ficha "${result.name}" carregada.`;
    } catch (error) {
        feedback.innerText = error.message || 'Não foi possível carregar a ficha.';
    }
}
function escapeAdminText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
async function openAdminUsers() {
    const modal = document.getElementById('admin-modal');
    if (!authToken || !modal) return;
    modal.style.display = 'flex';
    await loadAdminUsers();
}
async function loadAdminUsers() {
    const list = document.getElementById('admin-user-list');
    const feedback = document.getElementById('admin-feedback');
    list.innerHTML = '<p class="history-empty">Carregando usuários...</p>';
    feedback.innerText = '';
    const response = await fetch(apiUrl('/api/admin/users'), { headers: { Authorization: `Bearer ${authToken}` } });
    const result = await response.json();
    if (!response.ok) {
        feedback.innerText = result.error || 'Não foi possível carregar os usuários.';
        return;
    }
    list.innerHTML = result.users.map(user => `
        <div class="admin-user-row">
            <div class="admin-user-main"><strong>${escapeAdminText(user.username || 'Conta comum')}</strong><small>${escapeAdminText(user.createdAt ? new Date(user.createdAt).toLocaleString('pt-BR') : '')} | ${escapeAdminText(user.role)}</small></div>
            <input class="admin-user-email" id="admin-email-${escapeAdminText(user.id)}" type="email" value="${escapeAdminText(user.email)}" aria-label="E-mail do usuário">
            <span class="admin-password-mask">${user.passwordMasked}</span>
            <div class="admin-user-actions">${user.id === currentUser?.id ? '<span class="admin-self-label">Seu login</span>' : `<button type="button" onclick="saveAdminUser('${escapeAdminText(user.id)}')">Salvar e-mail</button><button type="button" onclick="resetAdminPassword('${escapeAdminText(user.id)}')">Nova senha</button>${user.role === 'admin' ? '' : `<button type="button" class="admin-delete-btn" onclick="deleteAdminUser('${escapeAdminText(user.id)}')">Excluir</button>`}`}</div>
        </div>`).join('') || '<p class="history-empty">Nenhum usuário cadastrado.</p>';
}
async function saveAdminUser(userId) {
    const email = document.getElementById(`admin-email-${userId}`).value;
    const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ email }) });
    const result = await response.json();
    document.getElementById('admin-feedback').innerText = response.ok ? 'E-mail atualizado.' : (result.error || 'Não foi possível atualizar.');
    if (response.ok) await loadAdminUsers();
}
async function resetAdminPassword(userId) {
    const password = prompt('Digite a nova senha (mínimo de 6 caracteres):');
    if (password === null) return;
    const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}/password`), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ password }) });
    const result = await response.json();
    document.getElementById('admin-feedback').innerText = response.ok ? 'Senha redefinida. A senha anterior não pode ser recuperada.' : (result.error || 'Não foi possível redefinir a senha.');
}
async function deleteAdminUser(userId) {
    if (!confirm('Excluir esta conta e a ficha salva associada?')) return;
    const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`), { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
    const result = await response.json();
    document.getElementById('admin-feedback').innerText = response.ok ? 'Usuário excluído.' : (result.error || 'Não foi possível excluir o usuário.');
    if (response.ok) await loadAdminUsers();
}
function openSaveOptions() {
    document.getElementById('save-feedback').innerText = '';
    document.getElementById('save-modal').style.display = 'flex';
}
async function saveSheetToAccount() {
    const feedback = document.getElementById('save-feedback');
    if (!authToken) {
        feedback.innerText = 'Faça login antes de salvar na conta.';
        return;
    }
    const name = prompt('Nome da ficha:', document.getElementById('char-name')?.value?.trim() || 'Minha ficha');
    if (!name?.trim()) return;
    feedback.innerText = 'Salvando...';
    const response = await fetch(apiUrl('/api/sheets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: name.trim(), sheet: collectSheetData() })
    });
    const result = await response.json();
    if (!response.ok) {
        feedback.innerText = result.error || 'Não foi possível salvar.';
        return;
    }
    feedback.innerText = 'Ficha salva na conta.';
    if (response.ok) closeModal('save-modal');
}
async function loadSheetFromAccount() {
    return;
}
async function restoreAuthSession() {
    if (!authToken)
        return updateAuthButton();
    try {
        const response = await fetch(apiUrl('/api/me'), { headers: { Authorization: `Bearer ${authToken}` } });
        if (!response.ok)
            return logout();
        const result = await response.json();
        updateAuthButton(result.user);
    }
    catch (error) {
        updateAuthButton();
    }
}
function toggleSoundMute(isMuted) {
    soundsMuted = isMuted;
}
function playDiceSound() {
    if (soundsMuted)
        return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass)
        return;
    const audioContext = window.diceAudioContext || new AudioContextClass();
    window.diceAudioContext = audioContext;
    if (audioContext.state === 'suspended')
        audioContext.resume();
    const startTime = audioContext.currentTime;
    const impactTimes = [0, 0.08, 0.17, 0.29, 0.42];
    impactTimes.forEach((time, index) => {
        const duration = 0.055 + Math.random() * 0.035;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let sample = 0; sample < data.length; sample++) {
            const envelope = Math.pow(1 - sample / data.length, 3);
            data[sample] = (Math.random() * 2 - 1) * envelope;
        }
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        const impactTime = startTime + time;
        source.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.value = 850 + Math.random() * 900;
        filter.Q.value = 1.1;
        gain.gain.setValueAtTime(0.0001, impactTime);
        gain.gain.exponentialRampToValueAtTime((0.22 - index * 0.025), impactTime + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, impactTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        source.start(impactTime);
    });
    const rollDuration = 0.5;
    const rollBuffer = audioContext.createBuffer(1, audioContext.sampleRate * rollDuration, audioContext.sampleRate);
    const rollData = rollBuffer.getChannelData(0);
    for (let sample = 0; sample < rollData.length; sample++) {
        const envelope = Math.pow(1 - sample / rollData.length, 1.5);
        rollData[sample] = (Math.random() * 2 - 1) * envelope;
    }
    const rollSource = audioContext.createBufferSource();
    const rollFilter = audioContext.createBiquadFilter();
    const rollGain = audioContext.createGain();
    rollSource.buffer = rollBuffer;
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 700;
    rollGain.gain.value = 0.045;
    rollSource.connect(rollFilter);
    rollFilter.connect(rollGain);
    rollGain.connect(audioContext.destination);
    rollSource.start(startTime);
}
function playAttackSound(type) {
    if (soundsMuted)
        return;
    const normalizedType = type.toLowerCase();
    const soundFiles = {
        balístico: 'rpg-sounds/balistico.mp3',
        balistico: 'rpg-sounds/balistico.mp3',
        corte: 'rpg-sounds/corte.mp3',
        impacto: 'rpg-sounds/impacto.mp3',
        químico: 'rpg-sounds/quimico.mp3',
        quimico: 'rpg-sounds/quimico.mp3',
        calor: 'rpg-sounds/calor.mp3',
        frio: 'rpg-sounds/frio.mp3',
        mental: 'rpg-sounds/mental.mp3'
    };
    const soundFile = soundFiles[normalizedType];
    if (soundFile) {
        const audio = new Audio(new URL(soundFile, document.baseURI).href);
        audio.volume = 0.7;
        audio.play().catch(() => { });
        setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
        }, 2000);
        return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass)
        return;
    const audioContext = window.diceAudioContext || new AudioContextClass();
    window.diceAudioContext = audioContext;
    if (audioContext.state === 'suspended')
        audioContext.resume();
    const now = audioContext.currentTime;
    const tone = (frequency, duration, volume, wave = 'sine', delay = 0, endFrequency = frequency) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, now + delay);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + delay + duration);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(volume, now + delay + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + delay);
        oscillator.stop(now + delay + duration + 0.02);
    };
    const noise = (duration, volume, filterType, frequency, delay = 0) => {
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) {
            data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, 2);
        }
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        source.buffer = buffer;
        filter.type = filterType;
        filter.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        source.start(now + delay);
    };
    if (normalizedType.includes('balíst') || normalizedType.includes('balist')) {
        noise(0.12, 0.42, 'highpass', 1200);
        noise(0.07, 0.18, 'bandpass', 3600, 0.025);
        tone(95, 0.4, 0.34, 'sawtooth', 0, 38);
        tone(210, 0.11, 0.18, 'square', 0.035, 90);
    }
    else if (normalizedType.includes('corte')) {
        noise(0.3, 0.2, 'bandpass', 2800);
        noise(0.18, 0.11, 'highpass', 5200, 0.04);
        tone(1700, 0.2, 0.13, 'triangle', 0, 430);
        tone(3200, 0.1, 0.08, 'sine', 0.08, 900);
    }
    else if (normalizedType.includes('impacto')) {
        tone(110, 0.34, 0.42, 'sine', 0, 34);
        tone(58, 0.22, 0.3, 'triangle', 0.015, 28);
        noise(0.14, 0.22, 'lowpass', 900, 0.01);
        noise(0.08, 0.1, 'bandpass', 1500, 0.08);
    }
    else if (normalizedType.includes('quím') || normalizedType.includes('quim')) {
        tone(180, 0.18, 0.16, 'sine');
        tone(240, 0.16, 0.13, 'sine', 0.13);
        tone(320, 0.14, 0.1, 'sine', 0.25);
        tone(420, 0.12, 0.08, 'sine', 0.34);
        noise(0.48, 0.09, 'highpass', 2200);
        noise(0.18, 0.07, 'bandpass', 900, 0.12);
    }
    else if (normalizedType.includes('calor')) {
        noise(0.55, 0.15, 'lowpass', 1300);
        noise(0.12, 0.12, 'highpass', 3200, 0.09);
        noise(0.1, 0.1, 'highpass', 2500, 0.27);
        tone(75, 0.46, 0.18, 'sawtooth', 0, 145);
        tone(145, 0.25, 0.08, 'triangle', 0.12, 230);
    }
    else if (normalizedType.includes('frio')) {
        noise(0.7, 0.1, 'bandpass', 900);
        noise(0.45, 0.07, 'highpass', 3400, 0.05);
        tone(900, 0.55, 0.09, 'sine', 0, 1500);
        tone(1300, 0.32, 0.06, 'triangle', 0.18, 2100);
    }
    else if (normalizedType.includes('mental')) {
        tone(700, 0.18, 0.14, 'sine', 0, 1300);
        tone(1100, 0.18, 0.12, 'sine', 0.1, 1800);
        tone(1600, 0.2, 0.1, 'triangle', 0.2, 2200);
        tone(2200, 0.16, 0.08, 'sine', 0.31, 2800);
        tone(3100, 0.12, 0.06, 'triangle', 0.39, 3600);
    }
}
function addHistoryEntry(title, details, total) {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!list)
        return;
    if (empty)
        empty.remove();
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `
            <div class="history-entry-title">${escapeHistoryText(title)}: ${escapeHistoryText(total)}</div>
            <div class="history-entry-details">${escapeHistoryText(details)}</div>
        `;
    list.prepend(entry);
}
function escapeHistoryText(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
function toggleHistory() {
    document.getElementById('history-panel').classList.toggle('open');
}
function clearHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class="history-empty" id="history-empty">Nenhuma rolagem realizada</div>';
}
function rollAttack(button) {
    const attack = button.closest('.dynamic-item-card');
    const title = attack.querySelector('.dynamic-item-title').value || 'Ataque';
    const attributeMap = { FOR: 'attr-for', VIG: 'attr-vigor', AGI: 'attr-agi', INT: 'attr-int', PRE: 'attr-pre' };
    const attributeCode = attack.dataset.attribute;
    const attributeValue = parseInt(document.getElementById(attributeMap[attributeCode])?.value, 10) || 0;
    const attackBonus = parseInt(attack.dataset.attackBonus, 10) || 0;
    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackTotal = d20 + (attributeValue * 2) + attackBonus;
    const criticalThreshold = parseInt(attack.dataset.critical, 10) || 0;
    const isCritical = criticalThreshold > 0 && d20 >= criticalThreshold;
    const criticalMultiplier = isCritical ? Math.max(1, parseInt(attack.dataset.multiplier, 10) || 1) : 1;
    const damage = rollDiceExpression(attack.dataset.damage || '0', criticalMultiplier);
    if (!damage) {
        showDiceResult(title, `Acerto: d20 [${d20}] + atributo (${attributeValue * 2}) + bônus (${attackBonus}) | Dano inválido`, attackTotal, attack.dataset.type);
        return;
    }
    const damageRolls = damage.rolls.length ? `[${damage.rolls.join(', ')}]` : 'sem dados';
    const criticalText = isCritical ? ` | CRÍTICO: ${criticalMultiplier}x` : '';
    showDiceResult(title, `Acerto: d20 [${d20}] + atributo (${attributeValue * 2}) + bônus (${attackBonus}) = ${attackTotal} | Dano: ${damageRolls} ${damage.bonus >= 0 ? '+' : ''}${damage.bonus}${criticalText}`, damage.total, attack.dataset.type);
}
function resetAttackModal() {
    editingAttack = null;
    document.getElementById('attack-modal-title').innerText = 'Novo Ataque';
    document.getElementById('attack-save-btn').innerText = 'Adicionar';
    ['attack-name', 'attack-type', 'attack-range', 'attack-skill', 'attack-attribute', 'attack-notes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    ['attack-damage', 'attack-critical', 'attack-multiplier', 'attack-bonus'].forEach(id => {
        document.getElementById(id).value = '0';
    });
    document.getElementById('damage-type-display').innerText = 'Selecionar';
    document.getElementById('damage-type-display').classList.remove('selected');
    ['attack-range', 'attack-skill', 'attack-attribute'].forEach(id => {
        document.getElementById(`${id}-display`).innerText = 'Selecionar';
        document.getElementById(`${id}-display`).classList.remove('selected');
    });
}
function openAttackModal() {
    resetAttackModal();
    openModal('attack-modal');
}
function editAttack(button) {
    const attack = button.closest('.dynamic-item-card');
    editingAttack = attack;
    document.getElementById('attack-modal-title').innerText = 'Editar Ataque';
    document.getElementById('attack-save-btn').innerText = 'Salvar alterações';
    document.getElementById('attack-name').value = attack.querySelector('.dynamic-item-title').value;
    document.getElementById('attack-damage').value = attack.dataset.damage || '0';
    document.getElementById('attack-critical').value = attack.dataset.critical || '0';
    document.getElementById('attack-multiplier').value = attack.dataset.multiplier || '0';
    document.getElementById('attack-bonus').value = attack.dataset.attackBonus || '0';
    document.getElementById('attack-notes').value = attack.dataset.notes || '';
    selectDamageType(attack.dataset.type || '');
    selectAttackValue('attack-range', attack.dataset.range || '');
    selectAttackValue('attack-skill', attack.dataset.skill || '');
    selectAttackValue('attack-attribute', attack.dataset.attribute || '');
    openModal('attack-modal');
}
function saveAttack() {
    const container = document.getElementById('attacks-container');
    const emptyMsg = document.getElementById('empty-attacks-msg');
    if (emptyMsg)
        emptyMsg.style.display = 'none';
    const item = editingAttack || document.createElement('div');
    item.className = 'dynamic-item-card';
    item.dataset.damage = getRawValue('attack-damage');
    item.dataset.critical = getRawValue('attack-critical');
    item.dataset.multiplier = getRawValue('attack-multiplier');
    item.dataset.attackBonus = getRawValue('attack-bonus');
    item.dataset.attribute = getRawValue('attack-attribute');
    item.dataset.range = getRawValue('attack-range');
    item.dataset.skill = getRawValue('attack-skill');
    item.dataset.type = getRawValue('attack-type');
    item.dataset.notes = getRawValue('attack-notes');
    item.innerHTML = `
            <div class="dynamic-item-header">
                <input type="text" class="dynamic-item-title" value="${getValue('attack-name')}">
            <button class="edit-item-btn" type="button" onclick="editAttack(this)">Editar</button>
                <button class="remove-item-btn" onclick="removeItem(this, 'attacks-container', 'empty-attacks-msg')">✕</button>
            </div>
            <div class="dynamic-item-header"><span>Dano: ${getValue('attack-damage')}</span><span>Crítico: ${getValue('attack-critical')}</span><span>Mult.: ${getValue('attack-multiplier')}</span></div>
            <div class="dynamic-item-header"><span>Ataque: ${getValue('attack-bonus')}</span><span>Alcance: ${getValue('attack-range')}</span></div>
            <div>${getValue('attack-type')} ${getValue('attack-skill')} ${getValue('attack-attribute')}</div>
            <div>${getValue('attack-notes')}</div>
            <button class="attack-roll-btn" type="button" onclick="rollAttack(this)">Rolar ataque</button>
        `;
    if (!editingAttack)
        container.appendChild(item);
    editingAttack = null;
    document.getElementById('attack-modal-title').innerText = 'Novo Ataque';
    document.getElementById('attack-save-btn').innerText = 'Adicionar';
    closeModal('attack-modal');
}
function resetAbilityModal() {
    editingAbility = null;
    document.getElementById('ability-modal-title').innerText = 'Nova Habilidade';
    document.getElementById('ability-save-btn').innerText = 'Adicionar';
    document.getElementById('ability-name').value = '';
    document.getElementById('ability-description').value = '';
}
function openAbilityModal() {
    resetAbilityModal();
    openModal('ability-modal');
}
function editAbility(button) {
    const ability = button.closest('.dynamic-item-card');
    editingAbility = ability;
    document.getElementById('ability-modal-title').innerText = 'Editar Habilidade';
    document.getElementById('ability-save-btn').innerText = 'Salvar alterações';
    document.getElementById('ability-name').value = ability.querySelector('.dynamic-item-title').value;
    document.getElementById('ability-description').value = ability.dataset.description || '';
    openModal('ability-modal');
}
function saveAbility() {
    const container = document.getElementById('abilities-container');
    const emptyMsg = document.getElementById('empty-abilities-msg');
    if (emptyMsg)
        emptyMsg.style.display = 'none';
    const item = editingAbility || document.createElement('div');
    item.className = 'dynamic-item-card';
    item.dataset.description = getRawValue('ability-description');
    item.innerHTML = `
            <div class="dynamic-item-header">
                <input type="text" class="dynamic-item-title" value="${getValue('ability-name')}">
            <button class="edit-item-btn" type="button" onclick="editAbility(this)">Editar</button>
                <button class="remove-item-btn" onclick="removeItem(this, 'abilities-container', 'empty-abilities-msg')">✕</button>
            </div>
            <div>${getValue('ability-description')}</div>
        `;
    if (!editingAbility)
        container.appendChild(item);
    editingAbility = null;
    document.getElementById('ability-modal-title').innerText = 'Nova Habilidade';
    document.getElementById('ability-save-btn').innerText = 'Adicionar';
    closeModal('ability-modal');
}
function getValue(id) {
    return document.getElementById(id).value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
function getRawValue(id) {
    return document.getElementById(id).value;
}
function prepareSheetForDownload(documentCopy) {
    documentCopy.querySelectorAll('input').forEach(input => {
        if (input.type !== 'file') {
            input.setAttribute('value', input.value);
        }
    });
    documentCopy.querySelectorAll('textarea').forEach(textarea => {
        textarea.textContent = textarea.value;
    });
}
function downloadSheet() {
    const sheetData = collectSheetData();
    const text = JSON.stringify(sheetData, null, 2);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ficha-rpg.txt';
    link.click();
    URL.revokeObjectURL(link.href);
}
function collectSheetData() {
    const fields = {};
    document.querySelectorAll('input[id], textarea[id], select[id]').forEach(field => {
        if (field.type !== 'file')
            fields[field.id] = field.value;
    });
    return {
        format: 'ficha-rpg-data',
        version: 1,
        fields,
        avatar: document.getElementById('avatar-frame').style.backgroundImage || '',
        textareas: Array.from(document.querySelectorAll('textarea:not([id])')).map(textarea => textarea.value),
        attacks: Array.from(document.querySelectorAll('#attacks-container .dynamic-item-card')).map(item => ({
            name: item.querySelector('.dynamic-item-title')?.value || '',
            damage: item.dataset.damage || '0',
            critical: item.dataset.critical || '0',
            multiplier: item.dataset.multiplier || '0',
            attackBonus: item.dataset.attackBonus || '0',
            attribute: item.dataset.attribute || '',
            range: item.dataset.range || '',
            skill: item.dataset.skill || '',
            type: item.dataset.type || '',
            notes: item.dataset.notes || ''
        })),
        abilities: Array.from(document.querySelectorAll('#abilities-container .dynamic-item-card')).map(item => ({
            name: item.querySelector('.dynamic-item-title')?.value || '',
            description: item.dataset.description || ''
        })),
        inventory: Array.from(document.querySelectorAll('#inventory-container .dynamic-item-card')).map(item => ({
            name: item.querySelector('.dynamic-item-title')?.value || '',
            quantity: item.querySelectorAll('input')[1]?.value || '',
            weight: item.querySelectorAll('input')[2]?.value || ''
        })),
        history: Array.from(document.querySelectorAll('#history-list .history-entry')).map(entry => ({
            title: entry.querySelector('.history-entry-title')?.innerText || '',
            details: entry.querySelector('.history-entry-details')?.innerText || ''
        }))
    };
}
function clearDynamicItems(containerId, emptyMessageId) {
    document.querySelectorAll(`#${containerId} .dynamic-item-card`).forEach(item => item.remove());
    const emptyMessage = document.getElementById(emptyMessageId);
    if (emptyMessage)
        emptyMessage.style.display = 'flex';
}
function restoreSheetData(sheetData) {
    Object.entries(sheetData.fields || {}).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field && field.type !== 'file')
            field.value = String(value);
    });
    const savedClass = sheetData.fields?.['char-class'] || '';
    const primarySelect = document.getElementById('char-class-primary');
    const evolutionSelect = document.getElementById('char-class-evolution');
    if (primarySelect && !primarySelect.value && savedClass) {
        const savedPrimary = Object.keys(classEvolutions).find(primary => primary === savedClass || classEvolutions[primary].includes(savedClass));
        if (savedPrimary) {
            primarySelect.value = savedPrimary;
            if (classEvolutions[savedPrimary].includes(savedClass) && evolutionSelect) {
                evolutionSelect.value = savedClass;
            }
        }
    }
    document.querySelectorAll('textarea:not([id])').forEach((textarea, index) => {
        textarea.value = sheetData.textareas?.[index] || '';
    });
    if (sheetData.avatar) {
        const avatarFrame = document.getElementById('avatar-frame');
        avatarFrame.style.backgroundImage = sheetData.avatar;
        avatarFrame.innerHTML = '';
    }
    clearDynamicItems('attacks-container', 'empty-attacks-msg');
    (sheetData.attacks || []).forEach(attack => {
        resetAttackModal();
        document.getElementById('attack-name').value = attack.name;
        document.getElementById('attack-damage').value = attack.damage;
        document.getElementById('attack-critical').value = attack.critical;
        document.getElementById('attack-multiplier').value = attack.multiplier;
        document.getElementById('attack-bonus').value = attack.attackBonus;
        document.getElementById('attack-notes').value = attack.notes;
        selectDamageType(attack.type);
        selectAttackValue('attack-range', attack.range);
        selectAttackValue('attack-skill', attack.skill);
        selectAttackValue('attack-attribute', attack.attribute);
        saveAttack();
    });
    clearDynamicItems('abilities-container', 'empty-abilities-msg');
    (sheetData.abilities || []).forEach(ability => {
        resetAbilityModal();
        document.getElementById('ability-name').value = ability.name;
        document.getElementById('ability-description').value = ability.description;
        saveAbility();
    });
    clearDynamicItems('inventory-container', 'empty-inventory-msg');
    (sheetData.inventory || []).forEach(inventoryItem => {
        addItem();
        const item = document.querySelector('#inventory-container .dynamic-item-card:last-child');
        const inputs = item.querySelectorAll('input');
        inputs[0].value = inventoryItem.name;
        inputs[1].value = inventoryItem.quantity;
        inputs[2].value = inventoryItem.weight;
    });
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    (sheetData.history || []).forEach(entry => {
        const historyEntry = document.createElement('div');
        historyEntry.className = 'history-entry';
        historyEntry.innerHTML = `<div class="history-entry-title"></div><div class="history-entry-details"></div>`;
        historyEntry.querySelector('.history-entry-title').innerText = entry.title;
        historyEntry.querySelector('.history-entry-details').innerText = entry.details;
        historyList.appendChild(historyEntry);
    });
    if (!sheetData.history?.length) {
        historyList.innerHTML = '<div class="history-empty" id="history-empty">Nenhuma rolagem realizada</div>';
    }
    document.querySelectorAll('.skill-row').forEach((row, index) => updateSkill(index));
    updateClassEvolutionOptions();
    renderClassMenu(false);
    Object.entries(sheetData.fields || {}).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field && (id.startsWith('class-choice-') || id.startsWith('class-free-')))
            field.value = String(value);
    });
    applyClassBenefits();
    calculateSheet();
    updateBars();
}
function loadSavedSheet(event) {
    const file = event.target.files[0];
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = function () {
        let sheetData = null;
        try {
            sheetData = JSON.parse(String(reader.result));
        }
        catch (error) {
            sheetData = null;
        }
        if (sheetData?.format === 'ficha-rpg-data') {
            restoreSheetData(sheetData);
            event.target.value = '';
            return;
        }
        const savedDocument = new DOMParser().parseFromString(String(reader.result), 'text/html');
        const savedSheet = savedDocument.querySelector('.sheet-container');
        const currentSheet = document.querySelector('.sheet-container');
        if (!savedSheet) {
            alert('O arquivo selecionado não é uma ficha válida.');
            return;
        }
        currentSheet.replaceWith(document.importNode(savedSheet, true));
        const savedHistory = savedDocument.querySelector('#history-list');
        const currentHistory = document.getElementById('history-list');
        if (savedHistory && currentHistory) {
            currentHistory.innerHTML = savedHistory.innerHTML;
        }
        calculateSheet();
        updateBars();
        event.target.value = '';
    };
    reader.readAsText(file);
}
function addItem() {
    const container = document.getElementById('inventory-container');
    const emptyMsg = document.getElementById('empty-inventory-msg');
    if (emptyMsg)
        emptyMsg.style.display = 'none';
    const item = document.createElement('div');
    item.className = 'dynamic-item-card';
    item.innerHTML = `
            <div class="dynamic-item-header">
                <input type="text" class="dynamic-item-title" placeholder="Nome do Item">
                <button class="remove-item-btn" onclick="removeItem(this, 'inventory-container', 'empty-inventory-msg')">✕</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <input type="text" placeholder="Qtd" style="background:transparent; border:none; border-bottom:1px solid #444; color:white; width:30%; outline:none; font-size:13px;">
                <input type="text" placeholder="Espaço/Peso" style="background:transparent; border:none; border-bottom:1px solid #444; color:white; width:70%; outline:none; font-size:13px;">
            </div>
        `;
    container.appendChild(item);
}
function removeItem(btn, containerId, msgId) {
    const card = btn.closest('.dynamic-item-card');
    card.remove();
    const container = document.getElementById(containerId);
    if (container.children.length === 1) {
        const msg = document.getElementById(msgId);
        if (msg)
            msg.style.display = 'flex';
    }
}
renderSkills();
renderAttackSelectors();
calculateSheet();
restoreAuthSession();
updateBars();
