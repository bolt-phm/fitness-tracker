const mealTypes = ["breakfast", "lunch", "dinner"];
const metricLabels = {
    weightKg: "体重",
    intakeCalories: "摄入热量",
    extraBurnCalories: "额外热量消耗",
    exerciseMinutes: "运动时长",
    exerciseCalories: "运动消耗热量",
    stepCount: "步数",
    sleepHours: "睡眠时长",
    hydrationMl: "饮水量",
    netCalories: "净热量",
};

const state = {
    profile: null,
    exerciseTypes: [],
    record: null,
    stats: null,
    editingTemplateId: null,
    editingEntryIndex: null,
    toastTimer: null,
};

document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    initializeDates();
    loadBootstrap(currentDateString());
});

function element(id) {
    return document.getElementById(id);
}

function currentDateString() {
    return new Date().toISOString().slice(0, 10);
}

function shiftDate(base, deltaDays) {
    const dateValue = new Date(`${base}T00:00:00`);
    dateValue.setDate(dateValue.getDate() + deltaDays);
    return dateValue.toISOString().slice(0, 10);
}

function initializeDates() {
    const today = currentDateString();
    element("record-date").value = today;
    element("stats-end").value = today;
    element("stats-start").value = shiftDate(today, -29);
}

function createEmptyRecord(dateValue) {
    return {
        date: dateValue,
        weightKg: null,
        intakeCalories: null,
        extraBurnCalories: null,
        stepCount: null,
        sleepHours: null,
        hydrationMl: null,
        note: "",
        meals: {
            breakfast: { planText: "", actualText: "", calories: null },
            lunch: { planText: "", actualText: "", calories: null },
            dinner: { planText: "", actualText: "", calories: null },
        },
        exerciseEntries: [],
    };
}

function toNumber(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value) {
    return value ?? "";
}

function formatMetric(value, unit = "") {
    if (value === null || value === undefined || value === "") {
        return "--";
    }
    const displayValue = Number.isFinite(value) ? Number(value).toFixed(Number.isInteger(value) ? 0 : 1) : value;
    return `${displayValue}${unit ? ` ${unit}` : ""}`;
}

function escapeHtml(value) {
    return safeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function apiFetch(path, options = {}) {
    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "请求失败");
    }
    return payload.data;
}

function showToast(message) {
    const toast = element("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.classList.add("hidden"), 180);
    }, 2400);
}

function bindEvents() {
    document.querySelectorAll(".tab-button").forEach((button) => {
        button.addEventListener("click", () => setPage(button.dataset.pageTarget));
    });

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
        button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
    });

    element("profile-form").addEventListener("submit", handleProfileSubmit);
    element("record-form").addEventListener("submit", handleRecordSubmit);
    element("load-date-btn").addEventListener("click", () => loadRecord(element("record-date").value));
    element("open-import-btn").addEventListener("click", () => element("import-dialog").showModal());
    element("delete-day-btn").addEventListener("click", handleRecordDelete);
    element("copy-summary-btn").addEventListener("click", copyTodaySummary);
    element("import-form").addEventListener("submit", handleImportSubmit);

    element("new-template-btn").addEventListener("click", () => openTemplateDialog());
    element("add-field-btn").addEventListener("click", () => appendTemplateFieldRow());
    element("template-form").addEventListener("submit", handleTemplateSubmit);
    element("template-list").addEventListener("click", handleTemplateListClick);

    element("new-entry-btn").addEventListener("click", () => openEntryDialog());
    element("entry-form").addEventListener("submit", handleEntrySubmit);
    element("entry-type").addEventListener("change", () => renderEntryCustomFields(element("entry-type").value));
    element("exercise-list").addEventListener("click", handleExerciseListClick);

    element("load-stats-btn").addEventListener("click", loadStats);
    element("metric-select").addEventListener("change", () => renderStats());
    document.querySelectorAll(".quick-range").forEach((button) => {
        button.addEventListener("click", () => {
            const end = currentDateString();
            const days = Number(button.dataset.days);
            element("stats-end").value = end;
            element("stats-start").value = shiftDate(end, -(days - 1));
            loadStats();
        });
    });
}

function setPage(pageName) {
    document.querySelectorAll(".tab-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.pageTarget === pageName);
    });
    document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("active", section.id === `page-${pageName}`);
    });
}

async function loadBootstrap(dateValue) {
    try {
        const data = await apiFetch(`/api/bootstrap?date=${dateValue}`);
        state.profile = data.profile;
        state.exerciseTypes = data.exerciseTypes;
        state.record = data.record || createEmptyRecord(dateValue);
        state.stats = data.defaultStats;
        renderProfile();
        renderRecord();
        renderTemplates();
        renderStats();
    } catch (error) {
        showToast(error.message);
    }
}

async function loadRecord(dateValue) {
    if (!dateValue) {
        showToast("请先选择日期。");
        return;
    }

    try {
        const record = await apiFetch(`/api/records/${dateValue}`);
        state.record = record;
        renderRecord();
        showToast(`已读取 ${dateValue} 的记录。`);
    } catch (error) {
        showToast(error.message);
    }
}

function renderProfile() {
    if (!state.profile) {
        return;
    }

    element("profile-height").value = state.profile.heightM ?? "";
    element("profile-start-weight").value = state.profile.startWeight ?? "";
    element("profile-target-weight").value = state.profile.targetWeight ?? "";
    element("profile-goal-days").value = state.profile.goalDays ?? "";
    element("profile-start-date").value = state.profile.startDate ?? currentDateString();
    element("profile-notes").value = safeText(state.profile.notes);

    const summary = state.profile.summary || {};
    element("hero-current-weight").textContent = formatMetric(summary.currentWeight, "kg");
    element("hero-bmi").textContent = summary.currentBmi ?? "--";
    element("hero-remaining-weight").textContent = formatMetric(summary.remainingWeight, "kg");
    element("hero-weekly-rate").textContent = formatMetric(summary.weeklyRate, "kg/周");

    const goalAlert = element("goal-alert");
    if (summary.warnings && summary.warnings.length) {
        goalAlert.innerHTML = summary.warnings.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
    } else {
        goalAlert.innerHTML = `
            <p>当前目标节奏处于可跟踪状态。</p>
            <p>预计每日热量缺口：${formatMetric(summary.requiredDailyDeficit, "kcal")}</p>
        `;
    }
}

function renderRecord() {
    const record = state.record || createEmptyRecord(element("record-date").value || currentDateString());
    state.record = record;

    element("record-date").value = record.date;
    element("record-weight").value = record.weightKg ?? "";
    element("record-intake").value = record.intakeCalories ?? "";
    element("record-extra-burn").value = record.extraBurnCalories ?? "";
    element("record-steps").value = record.stepCount ?? "";
    element("record-sleep").value = record.sleepHours ?? "";
    element("record-water").value = record.hydrationMl ?? "";
    element("record-note").value = safeText(record.note);

    mealTypes.forEach((mealType) => {
        const meal = record.meals?.[mealType] || {};
        element(`meal-${mealType}-plan`).value = safeText(meal.planText);
        element(`meal-${mealType}-actual`).value = safeText(meal.actualText);
        element(`meal-${mealType}-calories`).value = meal.calories ?? "";
    });

    renderExerciseEntries();
}

function gatherRecordFromForm() {
    const dateValue = element("record-date").value || currentDateString();
    return {
        date: dateValue,
        weightKg: toNumber(element("record-weight").value),
        intakeCalories: toNumber(element("record-intake").value),
        extraBurnCalories: toNumber(element("record-extra-burn").value),
        stepCount: toNumber(element("record-steps").value),
        sleepHours: toNumber(element("record-sleep").value),
        hydrationMl: toNumber(element("record-water").value),
        note: safeText(element("record-note").value),
        meals: {
            breakfast: {
                planText: safeText(element("meal-breakfast-plan").value),
                actualText: safeText(element("meal-breakfast-actual").value),
                calories: toNumber(element("meal-breakfast-calories").value),
            },
            lunch: {
                planText: safeText(element("meal-lunch-plan").value),
                actualText: safeText(element("meal-lunch-actual").value),
                calories: toNumber(element("meal-lunch-calories").value),
            },
            dinner: {
                planText: safeText(element("meal-dinner-plan").value),
                actualText: safeText(element("meal-dinner-actual").value),
                calories: toNumber(element("meal-dinner-calories").value),
            },
        },
        exerciseEntries: [...(state.record?.exerciseEntries || [])],
    };
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    try {
        const payload = {
            heightM: toNumber(element("profile-height").value),
            startWeight: toNumber(element("profile-start-weight").value),
            targetWeight: toNumber(element("profile-target-weight").value),
            goalDays: toNumber(element("profile-goal-days").value),
            startDate: element("profile-start-date").value,
            notes: safeText(element("profile-notes").value),
        };
        state.profile = await apiFetch("/api/profile", {
            method: "PUT",
            body: JSON.stringify(payload),
        });
        renderProfile();
        showToast("目标设置已保存。");
    } catch (error) {
        showToast(error.message);
    }
}

async function handleRecordSubmit(event) {
    event.preventDefault();
    try {
        const payload = gatherRecordFromForm();
        state.record = await apiFetch(`/api/records/${payload.date}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
        renderRecord();
        state.profile = await apiFetch("/api/profile");
        renderProfile();
        await loadStats();
        showToast("当天记录已保存。");
    } catch (error) {
        showToast(error.message);
    }
}

async function handleRecordDelete() {
    const dateValue = element("record-date").value;
    if (!dateValue) {
        showToast("请先选择日期。");
        return;
    }
    const confirmed = window.confirm(`确定删除 ${dateValue} 的记录吗？`);
    if (!confirmed) {
        return;
    }
    try {
        state.record = await apiFetch(`/api/records/${dateValue}`, {
            method: "DELETE",
        });
        renderRecord();
        state.profile = await apiFetch("/api/profile");
        renderProfile();
        await loadStats();
        showToast("当天记录已删除。");
    } catch (error) {
        showToast(error.message);
    }
}

async function handleImportSubmit(event) {
    event.preventDefault();
    try {
        const result = await apiFetch("/api/exchange/import", {
            method: "POST",
            body: JSON.stringify({
                text: element("import-text").value,
                defaultDate: element("record-date").value || currentDateString(),
                save: false,
            }),
        });
        state.record = result.record;
        setPage("entry");
        renderRecord();
        closeDialog("import-dialog");

        if (result.skippedTypes.length) {
            showToast(`已填充数据，但有未匹配模板被跳过：${result.skippedTypes.join("、")}`);
            return;
        }
        showToast("标准格式已解析并填充到表单。");
    } catch (error) {
        showToast(`解析失败：${error.message}`);
    }
}

function renderTemplates() {
    const container = element("template-list");
    if (!state.exerciseTypes.length) {
        container.innerHTML = `<div class="empty-state">还没有模板，先新增一个运动项目吧。</div>`;
        return;
    }

    container.innerHTML = state.exerciseTypes
        .map((template) => {
            const fields = template.fields.length
                ? template.fields.map((field) => `<span class="pill">${escapeHtml(field.label)} ${escapeHtml(field.unit || "")}</span>`).join("")
                : `<span class="pill">无额外参数</span>`;

            return `
                <article class="template-card">
                    <header>
                        <div>
                            <h4>${escapeHtml(template.name)}</h4>
                            <p class="muted">${escapeHtml(template.description || "未填写说明")}</p>
                        </div>
                        <div class="toolbar">
                            <button type="button" class="ghost" data-template-action="edit" data-template-id="${template.id}">编辑</button>
                            <button type="button" class="ghost danger" data-template-action="delete" data-template-id="${template.id}">删除</button>
                        </div>
                    </header>
                    <div class="pills">${fields}</div>
                </article>
            `;
        })
        .join("");
}

function handleTemplateListClick(event) {
    const action = event.target.dataset.templateAction;
    const templateId = Number(event.target.dataset.templateId);
    if (!action || !templateId) {
        return;
    }

    if (action === "edit") {
        openTemplateDialog(templateId);
        return;
    }

    if (action === "delete") {
        handleTemplateDelete(templateId);
    }
}

function openTemplateDialog(templateId = null) {
    state.editingTemplateId = templateId;
    const template = state.exerciseTypes.find((item) => item.id === templateId);

    element("template-dialog-title").textContent = template ? "编辑模板" : "新增模板";
    element("template-name").value = template?.name || "";
    element("template-description").value = template?.description || "";
    element("template-fields").innerHTML = "";

    if (template?.fields?.length) {
        template.fields.forEach((field) => appendTemplateFieldRow(field));
    } else {
        appendTemplateFieldRow();
    }

    element("template-dialog").showModal();
}

function appendTemplateFieldRow(field = {}) {
    const container = element("template-fields");
    const wrapper = document.createElement("div");
    wrapper.className = "field-row";
    wrapper.innerHTML = `
        <label>
            <span>参数名称</span>
            <input type="text" data-field-role="label" value="${escapeHtml(field.label || "")}" placeholder="例如：坡度">
        </label>
        <label>
            <span>单位</span>
            <input type="text" data-field-role="unit" value="${escapeHtml(field.unit || "")}" placeholder="例如：km/h">
        </label>
        <label>
            <span>类型</span>
            <select data-field-role="fieldType">
                <option value="number" ${field.fieldType === "number" || !field.fieldType ? "selected" : ""}>数字</option>
                <option value="text" ${field.fieldType === "text" ? "selected" : ""}>文字</option>
            </select>
        </label>
        <label>
            <span>默认值</span>
            <input type="text" data-field-role="defaultValue" value="${escapeHtml(field.defaultValue || "")}">
        </label>
        <div class="toolbar">
            <label>
                <span>必填</span>
                <select data-field-role="required">
                    <option value="false" ${field.required ? "" : "selected"}>否</option>
                    <option value="true" ${field.required ? "selected" : ""}>是</option>
                </select>
            </label>
            <button type="button" class="ghost danger" data-remove-field="true">删掉</button>
        </div>
    `;
    wrapper.querySelector("[data-remove-field='true']").addEventListener("click", () => {
        wrapper.remove();
    });
    container.appendChild(wrapper);
}

function collectTemplatePayload() {
    const fieldRows = [...element("template-fields").querySelectorAll(".field-row")];
    const fields = fieldRows
        .map((row) => ({
            label: row.querySelector("[data-field-role='label']").value.trim(),
            unit: row.querySelector("[data-field-role='unit']").value.trim(),
            fieldType: row.querySelector("[data-field-role='fieldType']").value,
            defaultValue: row.querySelector("[data-field-role='defaultValue']").value.trim(),
            required: row.querySelector("[data-field-role='required']").value === "true",
        }))
        .filter((field) => field.label);

    return {
        name: element("template-name").value.trim(),
        description: element("template-description").value.trim(),
        fields,
    };
}

async function handleTemplateSubmit(event) {
    event.preventDefault();
    const payload = collectTemplatePayload();
    if (!payload.name) {
        showToast("模板名称不能为空。");
        return;
    }

    try {
        const path = state.editingTemplateId
            ? `/api/exercise-types/${state.editingTemplateId}`
            : "/api/exercise-types";
        const method = state.editingTemplateId ? "PUT" : "POST";
        state.exerciseTypes = await apiFetch(path, {
            method,
            body: JSON.stringify(payload),
        });
        renderTemplates();
        closeDialog("template-dialog");
        showToast("模板已保存。");
    } catch (error) {
        showToast(error.message);
    }
}

async function handleTemplateDelete(templateId) {
    const template = state.exerciseTypes.find((item) => item.id === templateId);
    if (!template) {
        return;
    }
    const confirmed = window.confirm(`确定删除模板“${template.name}”吗？`);
    if (!confirmed) {
        return;
    }

    try {
        state.exerciseTypes = await apiFetch(`/api/exercise-types/${templateId}`, {
            method: "DELETE",
        });
        renderTemplates();
        showToast("模板已删除。");
    } catch (error) {
        showToast(error.message);
    }
}

function renderExerciseEntries() {
    const container = element("exercise-list");
    const entries = state.record?.exerciseEntries || [];
    if (!entries.length) {
        container.className = "exercise-list empty-state";
        container.textContent = "还没有添加运动记录。";
        return;
    }

    container.className = "exercise-list";
    container.innerHTML = entries
        .map((entry, index) => {
            const values = entry.values?.length
                ? entry.values.map((value) => `<span class="pill">${escapeHtml(value.label)}: ${escapeHtml(value.valueText)} ${escapeHtml(value.unit || "")}</span>`).join("")
                : `<span class="pill">无额外参数</span>`;

            return `
                <article class="entry-card">
                    <header>
                        <div>
                            <h4>${escapeHtml(findExerciseType(entry.exerciseTypeId)?.name || entry.exerciseTypeName || "未命名项目")}</h4>
                            <p class="muted">
                                时长 ${formatMetric(entry.durationMinutes, "分钟")} / 消耗 ${formatMetric(entry.caloriesBurned, "kcal")} / 强度 ${escapeHtml(entry.intensity || "未填")}
                            </p>
                        </div>
                        <div class="toolbar">
                            <button type="button" class="ghost" data-entry-action="edit" data-entry-index="${index}">编辑</button>
                            <button type="button" class="ghost danger" data-entry-action="delete" data-entry-index="${index}">删除</button>
                        </div>
                    </header>
                    <div class="pills">${values}</div>
                    ${entry.note ? `<p class="muted">${escapeHtml(entry.note)}</p>` : ""}
                </article>
            `;
        })
        .join("");
}

function handleExerciseListClick(event) {
    const action = event.target.dataset.entryAction;
    const entryIndex = Number(event.target.dataset.entryIndex);
    if (!action && action !== "") {
        return;
    }
    if (Number.isNaN(entryIndex)) {
        return;
    }

    if (action === "edit") {
        openEntryDialog(entryIndex);
        return;
    }

    if (action === "delete") {
        state.record.exerciseEntries.splice(entryIndex, 1);
        renderExerciseEntries();
        showToast("运动记录已移除。");
    }
}

function findExerciseType(typeId) {
    return state.exerciseTypes.find((item) => item.id === Number(typeId));
}

function openEntryDialog(entryIndex = null) {
    if (!state.exerciseTypes.length) {
        showToast("请先新增至少一个运动模板。");
        return;
    }

    state.editingEntryIndex = entryIndex;
    const entry = Number.isInteger(entryIndex) ? state.record.exerciseEntries[entryIndex] : null;

    element("entry-dialog-title").textContent = entry ? "编辑运动记录" : "新增运动记录";
    element("entry-type").innerHTML = state.exerciseTypes
        .map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`)
        .join("");

    const selectedTypeId = entry?.exerciseTypeId || state.exerciseTypes[0].id;
    element("entry-type").value = selectedTypeId;
    element("entry-duration").value = entry?.durationMinutes ?? "";
    element("entry-calories").value = entry?.caloriesBurned ?? "";
    element("entry-intensity").value = entry?.intensity ?? "";
    element("entry-note").value = entry?.note ?? "";

    const existingValueMap = Object.fromEntries(
        (entry?.values || []).map((value) => [value.fieldKey || value.label, value.valueText])
    );
    renderEntryCustomFields(selectedTypeId, existingValueMap);
    element("entry-dialog").showModal();
}

function renderEntryCustomFields(typeId, existingValueMap = {}) {
    const container = element("entry-custom-fields");
    const exerciseType = findExerciseType(typeId);
    if (!exerciseType || !exerciseType.fields.length) {
        container.innerHTML = `<div class="empty-state">这个模板没有额外参数。</div>`;
        return;
    }

    container.innerHTML = "";
    exerciseType.fields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "field-row compact";
        const value = existingValueMap[field.fieldKey] ?? existingValueMap[field.label] ?? field.defaultValue ?? "";
        const inputType = field.fieldType === "text" ? "text" : "number";
        row.innerHTML = `
            <label>
                <span>${escapeHtml(field.label)} ${field.unit ? `(${escapeHtml(field.unit)})` : ""}</span>
                <input
                    type="${inputType}"
                    data-entry-field-key="${escapeHtml(field.fieldKey)}"
                    data-entry-field-label="${escapeHtml(field.label)}"
                    data-entry-field-unit="${escapeHtml(field.unit || "")}"
                    value="${escapeHtml(value)}"
                    ${field.required ? "required" : ""}
                >
            </label>
        `;
        container.appendChild(row);
    });
}

function collectEntryPayload() {
    const exerciseTypeId = Number(element("entry-type").value);
    const exerciseType = findExerciseType(exerciseTypeId);
    const valueInputs = [...element("entry-custom-fields").querySelectorAll("[data-entry-field-key]")];
    const values = valueInputs
        .map((input) => ({
            fieldKey: input.dataset.entryFieldKey,
            label: input.dataset.entryFieldLabel,
            unit: input.dataset.entryFieldUnit,
            valueText: input.value.trim(),
        }))
        .filter((value) => value.valueText);

    return {
        exerciseTypeId,
        exerciseTypeName: exerciseType?.name || "",
        durationMinutes: toNumber(element("entry-duration").value),
        caloriesBurned: toNumber(element("entry-calories").value),
        intensity: safeText(element("entry-intensity").value),
        note: safeText(element("entry-note").value),
        values,
    };
}

function handleEntrySubmit(event) {
    event.preventDefault();
    const payload = collectEntryPayload();
    if (!payload.exerciseTypeId) {
        showToast("请选择运动类型。");
        return;
    }

    if (!state.record) {
        state.record = createEmptyRecord(element("record-date").value || currentDateString());
    }

    if (Number.isInteger(state.editingEntryIndex)) {
        state.record.exerciseEntries[state.editingEntryIndex] = payload;
    } else {
        state.record.exerciseEntries.push(payload);
    }

    renderExerciseEntries();
    closeDialog("entry-dialog");
    showToast("运动记录已更新。");
}

async function loadStats() {
    const start = element("stats-start").value;
    const end = element("stats-end").value;
    if (!start || !end) {
        showToast("请先选择统计日期范围。");
        return;
    }

    try {
        state.stats = await apiFetch(`/api/stats?start=${start}&end=${end}`);
        renderStats();
        showToast("统计已刷新。");
    } catch (error) {
        showToast(error.message);
    }
}

function renderStats() {
    if (!state.stats) {
        return;
    }

    renderSummaryCards();
    renderBreakdownTable();
    renderStatsTable();
    renderChart();
}

function renderSummaryCards() {
    const summary = state.stats.summary || {};
    const cards = [
        ["已记录天数", formatMetric(summary.daysLogged, "天")],
        ["平均体重", formatMetric(summary.averageWeight, "kg")],
        ["体重变化", formatMetric(summary.weightChange, "kg")],
        ["总运动时长", formatMetric(summary.totalExerciseMinutes, "分钟")],
        ["总运动消耗", formatMetric(summary.totalExerciseCalories, "kcal")],
        ["总训练次数", formatMetric(summary.totalSessions, "次")],
    ];

    element("stats-summary").innerHTML = cards
        .map(
            ([label, value]) => `
                <div class="metric-card">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(value)}</strong>
                </div>
            `
        )
        .join("");
}

function renderBreakdownTable() {
    const container = element("exercise-breakdown");
    const items = state.stats.exerciseBreakdown || [];
    if (!items.length) {
        container.innerHTML = `<div class="empty-state">这段时间还没有运动记录。</div>`;
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>运动项目</th>
                    <th>次数</th>
                    <th>总时长</th>
                    <th>总消耗</th>
                </tr>
            </thead>
            <tbody>
                ${items
                    .map(
                        (item) => `
                            <tr>
                                <td>${escapeHtml(item.name)}</td>
                                <td>${item.sessions}</td>
                                <td>${formatMetric(item.totalMinutes, "分钟")}</td>
                                <td>${formatMetric(item.totalCalories, "kcal")}</td>
                            </tr>
                        `
                    )
                    .join("")}
            </tbody>
        </table>
    `;
}

function renderStatsTable() {
    const container = element("stats-table");
    const rows = state.stats.series || [];
    if (!rows.length) {
        container.innerHTML = `<div class="empty-state">这个时段还没有可查询的数据。</div>`;
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>体重</th>
                    <th>摄入热量</th>
                    <th>运动时长</th>
                    <th>运动消耗</th>
                    <th>步数</th>
                    <th>睡眠</th>
                    <th>饮水</th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map(
                        (row) => `
                            <tr>
                                <td>${row.date}</td>
                                <td>${formatMetric(row.weightKg, "kg")}</td>
                                <td>${formatMetric(row.intakeCalories, "kcal")}</td>
                                <td>${formatMetric(row.exerciseMinutes, "分钟")}</td>
                                <td>${formatMetric(row.exerciseCalories, "kcal")}</td>
                                <td>${formatMetric(row.stepCount, "步")}</td>
                                <td>${formatMetric(row.sleepHours, "小时")}</td>
                                <td>${formatMetric(row.hydrationMl, "ml")}</td>
                            </tr>
                        `
                    )
                    .join("")}
            </tbody>
        </table>
    `;
}

function renderChart() {
    const metric = element("metric-select").value;
    const series = state.stats.series || [];
    const points = series
        .filter((item) => item[metric] !== null && item[metric] !== undefined)
        .map((item) => ({ date: item.date, value: Number(item[metric]) }));

    element("chart-title").textContent = `${metricLabels[metric]}趋势图`;
    element("chart-caption").textContent = `${state.stats.startDate} 至 ${state.stats.endDate}`;

    const svg = element("stats-chart");
    const emptyState = element("chart-empty");
    if (!points.length) {
        svg.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    const width = 960;
    const height = 320;
    const padding = { top: 24, right: 40, bottom: 44, left: 58 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pointList = points.map((point, index) => {
        const x = padding.left + (plotWidth * index) / Math.max(points.length - 1, 1);
        const y = padding.top + plotHeight - ((point.value - min) / range) * plotHeight;
        return { ...point, x, y };
    });

    const pathData = pointList.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const gridLines = [0, 0.25, 0.5, 0.75, 1]
        .map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            const value = (max - range * ratio).toFixed(1);
            return `
                <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(32,104,79,0.12)" />
                <text x="8" y="${y + 4}" fill="#5f6f62" font-size="12">${value}</text>
            `;
        })
        .join("");

    const labels = pointList
        .map(
            (point) => `
                <text x="${point.x}" y="${height - 14}" text-anchor="middle" fill="#5f6f62" font-size="12">
                    ${point.date.slice(5)}
                </text>
            `
        )
        .join("");

    const dots = pointList
        .map(
            (point) => `
                <circle cx="${point.x}" cy="${point.y}" r="5" fill="#1f6a50" />
                <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" fill="#1f2d20" font-size="12">
                    ${point.value}
                </text>
            `
        )
        .join("");

    svg.innerHTML = `
        <defs>
            <linearGradient id="chart-line" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#1b5c45" />
                <stop offset="100%" stop-color="#2f9170" />
            </linearGradient>
        </defs>
        ${gridLines}
        <path d="${pathData}" fill="none" stroke="url(#chart-line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
        ${labels}
    `;
}

async function copyTodaySummary() {
    let result;
    try {
        result = await apiFetch("/api/exchange/export", {
            method: "POST",
            body: JSON.stringify({
                record: gatherRecordFromForm(),
            }),
        });
        await navigator.clipboard.writeText(result.text);
        showToast("今日摘要已复制，你可以直接发给我。");
    } catch (error) {
        try {
            if (!result) {
                result = await apiFetch("/api/exchange/export", {
                    method: "POST",
                    body: JSON.stringify({
                        record: gatherRecordFromForm(),
                    }),
                });
            }
            await navigator.clipboard.writeText(result.text);
            showToast("今日摘要已复制，你可以直接发给我。");
        } catch (fallbackError) {
            if (!result) {
                result = await apiFetch("/api/exchange/export", {
                    method: "POST",
                    body: JSON.stringify({
                        record: gatherRecordFromForm(),
                    }),
                });
            }
            window.prompt("复制下面这段内容发给我：", result.text);
        }
    }
}

function closeDialog(dialogId) {
    const dialog = element(dialogId);
    if (dialog.open) {
        dialog.close();
    }
    if (dialogId === "template-dialog") {
        state.editingTemplateId = null;
    }
    if (dialogId === "entry-dialog") {
        state.editingEntryIndex = null;
    }
    if (dialogId === "import-dialog") {
        element("import-text").value = "";
    }
}
