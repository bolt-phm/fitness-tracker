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
    scaleBmi: "体脂秤BMI",
    bodyFatPct: "体脂率",
    muscleRatePct: "肌肉率",
    skeletalMuscleKg: "骨骼肌量",
    visceralFatLevel: "内脏脂肪等级",
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

function formatDateInputValue(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function currentDateString() {
    return formatDateInputValue(new Date());
}

function shiftDate(base, deltaDays) {
    const dateValue = new Date(`${base}T00:00:00`);
    dateValue.setDate(dateValue.getDate() + deltaDays);
    return formatDateInputValue(dateValue);
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
        bodyScore: null,
        scaleBmi: null,
        bodyFatPct: null,
        fatMassKg: null,
        muscleRatePct: null,
        muscleMassKg: null,
        skeletalMuscleKg: null,
        bodyWaterPct: null,
        bodyWaterKg: null,
        proteinPct: null,
        proteinKg: null,
        visceralFatLevel: null,
        bmrKcal: null,
        waistHipRatio: null,
        bodyAge: null,
        fatFreeMassKg: null,
        boneSaltKg: null,
        boneSaltPct: null,
        heartRateBpm: null,
        boneMuscleIndex: null,
        recommendedCalories: null,
        bodyType: "",
        bodyShape: "",
        note: "",
        meals: {
            breakfast: { planText: "", actualText: "", calories: null },
            lunch: { planText: "", actualText: "", calories: null },
            dinner: { planText: "", actualText: "", calories: null },
        },
        exerciseEntries: [],
    };
}

function safeText(value) {
    return value ?? "";
}

function escapeHtml(value) {
    return safeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toNumber(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value, unit = "") {
    if (value === null || value === undefined || value === "") {
        return "--";
    }
    const numberValue = Number(value);
    const display = Number.isFinite(numberValue)
        ? numberValue.toFixed(Number.isInteger(numberValue) ? 0 : 1)
        : value;
    return `${display}${unit ? ` ${unit}` : ""}`;
}

function formatSignedMetric(value, unit = "") {
    if (value === null || value === undefined || value === "") {
        return "--";
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
        return String(value);
    }
    const sign = numberValue > 0 ? "+" : "";
    return `${sign}${numberValue.toFixed(Number.isInteger(numberValue) ? 0 : 1)}${unit ? ` ${unit}` : ""}`;
}

function formatDateLabel(value) {
    if (!value) {
        return "--";
    }
    const dateValue = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dateValue.getTime())) {
        return value;
    }
    return `${dateValue.getMonth() + 1}月${dateValue.getDate()}日`;
}

function previewText(value, fallback = "待补充") {
    const text = safeText(value).replace(/\s+/g, " ").trim();
    if (!text) {
        return fallback;
    }
    return text.length <= 38 ? text : `${text.slice(0, 38)}…`;
}

function calculateMealTotal(record) {
    return mealTypes.reduce((sum, mealType) => {
        const calories = Number(record.meals?.[mealType]?.calories);
        return Number.isFinite(calories) ? sum + calories : sum;
    }, 0);
}

function calculateExerciseTotals(entries = []) {
    return entries.reduce(
        (totals, entry) => {
            const minutes = Number(entry.durationMinutes);
            const calories = Number(entry.caloriesBurned);
            if (Number.isFinite(minutes)) {
                totals.minutes += minutes;
            }
            if (Number.isFinite(calories)) {
                totals.calories += calories;
            }
            totals.sessions += 1;
            return totals;
        },
        { minutes: 0, calories: 0, sessions: 0 }
    );
}

function parseEveningSegments(text) {
    const result = { pre: "", post: "" };
    const lines = safeText(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        return result;
    }

    const leftovers = [];
    for (const line of lines) {
        const normalized = line.replace(/^[-•\d.\s]+/, "");
        let match;
        if ((match = normalized.match(/^(练前加餐|练前餐|训练前加餐|训练前)[:：]?\s*(.*)$/))) {
            result.pre = [result.pre, match[2]].filter(Boolean).join("\n").trim();
            continue;
        }
        if ((match = normalized.match(/^(练后晚餐|练后餐|训练后晚餐|训练后)[:：]?\s*(.*)$/))) {
            result.post = [result.post, match[2]].filter(Boolean).join("\n").trim();
            continue;
        }
        leftovers.push(line);
    }

    if (leftovers.length) {
        result.post = [result.post, leftovers.join("\n")].filter(Boolean).join("\n").trim();
    }

    return result;
}

function composeEveningSegments(preText, postText) {
    const lines = [];
    const pre = safeText(preText).trim();
    const post = safeText(postText).trim();
    if (pre) {
        lines.push(`练前加餐：${pre}`);
    }
    if (post) {
        lines.push(`练后晚餐：${post}`);
    }
    return lines.join("\n");
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
    }, 2600);
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
    element("record-form").addEventListener("input", refreshEntrySummary);
    element("record-form").addEventListener("change", refreshEntrySummary);

    element("load-date-btn").addEventListener("click", () => loadRecord(element("record-date").value));
    element("open-import-btn").addEventListener("click", () => element("import-dialog").showModal());
    element("delete-day-btn").addEventListener("click", handleRecordDelete);
    element("copy-summary-btn").addEventListener("click", copyTodaySummary);
    element("import-form").addEventListener("submit", handleImportSubmit);
    element("sync-intake-btn").addEventListener("click", syncMealCaloriesToIntake);
    element("sync-extra-burn-btn").addEventListener("click", syncExerciseCaloriesToBurn);

    element("new-template-btn").addEventListener("click", () => openTemplateDialog());
    element("add-field-btn").addEventListener("click", () => appendTemplateFieldRow());
    element("template-form").addEventListener("submit", handleTemplateSubmit);
    element("template-list").addEventListener("click", handleTemplateListClick);

    element("new-entry-btn").addEventListener("click", () => openEntryDialog());
    element("entry-form").addEventListener("submit", handleEntrySubmit);
    element("entry-type").addEventListener("change", () => renderEntryCustomFields(element("entry-type").value));
    element("exercise-list").addEventListener("click", handleExerciseListClick);

    element("load-stats-btn").addEventListener("click", loadStats);
    element("metric-select").addEventListener("change", renderStats);
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
        state.record = await apiFetch(`/api/records/${dateValue}`);
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

    element("hero-warning-list").innerHTML = (summary.warnings || []).length
        ? summary.warnings.map((item) => `<div class="warning-pill">${escapeHtml(item)}</div>`).join("")
        : `<div class="warning-pill safe">当前目标节奏处于可跟踪状态。</div>`;

    const goalAlert = element("goal-alert");
    if ((summary.warnings || []).length) {
        goalAlert.innerHTML = summary.warnings.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
    } else {
        goalAlert.innerHTML = `
            <p>当前目标节奏处于可跟踪状态。</p>
            <p>预计每日热量缺口：${formatMetric(summary.requiredDailyDeficit, "kcal")}</p>
        `;
    }
}

function renderRecord() {
    const dateValue = element("record-date").value || currentDateString();
    state.record = state.record || createEmptyRecord(dateValue);

    const record = state.record;
    element("record-date").value = record.date || dateValue;
    element("record-weight").value = record.weightKg ?? "";
    element("record-intake").value = record.intakeCalories ?? "";
    element("record-extra-burn").value = record.extraBurnCalories ?? "";
    element("record-steps").value = record.stepCount ?? "";
    element("record-sleep").value = record.sleepHours ?? "";
    element("record-water").value = record.hydrationMl ?? "";
    element("record-body-score").value = record.bodyScore ?? "";
    element("record-scale-bmi").value = record.scaleBmi ?? "";
    element("record-body-fat").value = record.bodyFatPct ?? "";
    element("record-fat-mass").value = record.fatMassKg ?? "";
    element("record-muscle-rate").value = record.muscleRatePct ?? "";
    element("record-muscle-mass").value = record.muscleMassKg ?? "";
    element("record-skeletal-muscle").value = record.skeletalMuscleKg ?? "";
    element("record-water-percent").value = record.bodyWaterPct ?? "";
    element("record-water-mass").value = record.bodyWaterKg ?? "";
    element("record-protein-percent").value = record.proteinPct ?? "";
    element("record-protein-mass").value = record.proteinKg ?? "";
    element("record-visceral-fat").value = record.visceralFatLevel ?? "";
    element("record-bmr").value = record.bmrKcal ?? "";
    element("record-whr").value = record.waistHipRatio ?? "";
    element("record-body-age").value = record.bodyAge ?? "";
    element("record-fat-free-mass").value = record.fatFreeMassKg ?? "";
    element("record-bone-salt-mass").value = record.boneSaltKg ?? "";
    element("record-bone-salt-percent").value = record.boneSaltPct ?? "";
    element("record-heart-rate").value = record.heartRateBpm ?? "";
    element("record-bone-muscle-index").value = record.boneMuscleIndex ?? "";
    element("record-recommended-calories").value = record.recommendedCalories ?? "";
    element("record-body-type").value = record.bodyType ?? "";
    element("record-body-shape").value = record.bodyShape ?? "";
    element("record-note").value = safeText(record.note);

    const breakfast = record.meals?.breakfast || {};
    const lunch = record.meals?.lunch || {};
    const dinner = record.meals?.dinner || {};
    const dinnerPlan = parseEveningSegments(dinner.planText);
    const dinnerActual = parseEveningSegments(dinner.actualText);

    element("meal-breakfast-plan").value = safeText(breakfast.planText);
    element("meal-breakfast-actual").value = safeText(breakfast.actualText);
    element("meal-breakfast-calories").value = breakfast.calories ?? "";

    element("meal-lunch-plan").value = safeText(lunch.planText);
    element("meal-lunch-actual").value = safeText(lunch.actualText);
    element("meal-lunch-calories").value = lunch.calories ?? "";

    element("meal-dinner-pre-plan").value = safeText(dinnerPlan.pre);
    element("meal-dinner-post-plan").value = safeText(dinnerPlan.post);
    element("meal-dinner-pre-actual").value = safeText(dinnerActual.pre);
    element("meal-dinner-post-actual").value = safeText(dinnerActual.post);
    element("meal-dinner-calories").value = dinner.calories ?? "";

    renderExerciseEntries();
    refreshEntrySummary();
}

function gatherRecordFromForm() {
    return {
        date: element("record-date").value || currentDateString(),
        weightKg: toNumber(element("record-weight").value),
        intakeCalories: toNumber(element("record-intake").value),
        extraBurnCalories: toNumber(element("record-extra-burn").value),
        stepCount: toNumber(element("record-steps").value),
        sleepHours: toNumber(element("record-sleep").value),
        hydrationMl: toNumber(element("record-water").value),
        bodyScore: toNumber(element("record-body-score").value),
        scaleBmi: toNumber(element("record-scale-bmi").value),
        bodyFatPct: toNumber(element("record-body-fat").value),
        fatMassKg: toNumber(element("record-fat-mass").value),
        muscleRatePct: toNumber(element("record-muscle-rate").value),
        muscleMassKg: toNumber(element("record-muscle-mass").value),
        skeletalMuscleKg: toNumber(element("record-skeletal-muscle").value),
        bodyWaterPct: toNumber(element("record-water-percent").value),
        bodyWaterKg: toNumber(element("record-water-mass").value),
        proteinPct: toNumber(element("record-protein-percent").value),
        proteinKg: toNumber(element("record-protein-mass").value),
        visceralFatLevel: toNumber(element("record-visceral-fat").value),
        bmrKcal: toNumber(element("record-bmr").value),
        waistHipRatio: toNumber(element("record-whr").value),
        bodyAge: toNumber(element("record-body-age").value),
        fatFreeMassKg: toNumber(element("record-fat-free-mass").value),
        boneSaltKg: toNumber(element("record-bone-salt-mass").value),
        boneSaltPct: toNumber(element("record-bone-salt-percent").value),
        heartRateBpm: toNumber(element("record-heart-rate").value),
        boneMuscleIndex: toNumber(element("record-bone-muscle-index").value),
        recommendedCalories: toNumber(element("record-recommended-calories").value),
        bodyType: safeText(element("record-body-type").value),
        bodyShape: safeText(element("record-body-shape").value),
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
                planText: composeEveningSegments(
                    element("meal-dinner-pre-plan").value,
                    element("meal-dinner-post-plan").value
                ),
                actualText: composeEveningSegments(
                    element("meal-dinner-pre-actual").value,
                    element("meal-dinner-post-actual").value
                ),
                calories: toNumber(element("meal-dinner-calories").value),
            },
        },
        exerciseEntries: [...(state.record?.exerciseEntries || [])],
    };
}

function refreshEntrySummary() {
    const draft = gatherRecordFromForm();
    const mealTotal = calculateMealTotal(draft);
    const exerciseTotals = calculateExerciseTotals(draft.exerciseEntries);
    const intake = draft.intakeCalories;
    const extraBurn = draft.extraBurnCalories;

    element("entry-summary-weight").textContent = formatMetric(draft.weightKg, "kg");
    element("entry-summary-meals").textContent = mealTotal ? formatMetric(mealTotal, "kcal") : "--";
    element("entry-summary-intake").textContent = formatMetric(intake, "kcal");
    element("entry-summary-training").textContent = exerciseTotals.sessions
        ? `${exerciseTotals.sessions} 项 / ${formatMetric(exerciseTotals.minutes, "分钟")}`
        : "--";
    element("entry-summary-burn").textContent = formatMetric(extraBurn, "kcal");
    element("entry-summary-net").textContent = formatSignedMetric(
        intake !== null && extraBurn !== null ? intake - extraBurn : null,
        "kcal"
    );

    renderSyncHints(draft, mealTotal, exerciseTotals);
    renderDayTimeline(draft, exerciseTotals);
}

function renderSyncHints(record, mealTotal, exerciseTotals) {
    const hints = [];
    const intake = record.intakeCalories;
    const extraBurn = record.extraBurnCalories;

    if (mealTotal && intake !== null && Math.abs(mealTotal - intake) >= 40) {
        hints.push(`三餐热量合计 ${mealTotal} kcal，与“今日摄入”相差 ${Math.abs(mealTotal - intake)} kcal。`);
    }
    if (exerciseTotals.calories && extraBurn !== null && Math.abs(Math.round(exerciseTotals.calories) - extraBurn) >= 40) {
        hints.push(`训练明细合计消耗 ${Math.round(exerciseTotals.calories)} kcal，与“额外消耗”相差 ${Math.abs(Math.round(exerciseTotals.calories) - extraBurn)} kcal。`);
    }
    if (!record.weightKg) {
        hints.push("今天体重还没填，空腹体重最好尽量补上。");
    }
    if (record.sleepHours !== null && record.sleepHours < 7) {
        hints.push("睡眠低于 7 小时，第二天训练强度要慎重上调。");
    }
    if (!hints.length) {
        hints.push("记录结构已经对齐，可以继续补训练细节和实际餐次。");
    }

    element("entry-sync-hints").innerHTML = hints
        .map((item) => `<div class="status-item">${escapeHtml(item)}</div>`)
        .join("");
}

function renderDayTimeline(record, exerciseTotals) {
    const dinnerPlan = parseEveningSegments(record.meals?.dinner?.planText);
    const dinnerActual = parseEveningSegments(record.meals?.dinner?.actualText);
    const trainingNames = (record.exerciseEntries || [])
        .map((entry) => entry.exerciseTypeName || findExerciseType(entry.exerciseTypeId)?.name)
        .filter(Boolean)
        .join(" / ");

    const items = [
        {
            label: "早餐",
            phase: "早间启动",
            text: previewText(record.meals?.breakfast?.actualText || record.meals?.breakfast?.planText),
        },
        {
            label: "午餐",
            phase: "白天主餐",
            text: previewText(record.meals?.lunch?.actualText || record.meals?.lunch?.planText),
        },
        {
            label: "练前",
            phase: "傍晚补能",
            text: previewText(dinnerActual.pre || dinnerPlan.pre, "待安排练前加餐"),
        },
        {
            label: "训练",
            phase: exerciseTotals.sessions ? `${exerciseTotals.sessions} 项 / ${Math.round(exerciseTotals.minutes)} 分钟` : "待安排",
            text: previewText(trainingNames, "还没有训练条目"),
        },
        {
            label: "练后",
            phase: "夜间恢复",
            text: previewText(dinnerActual.post || dinnerPlan.post, "待安排练后晚餐"),
        },
    ];

    element("day-timeline").innerHTML = items
        .map(
            (item) => `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-copy">
                        <div class="timeline-head">
                            <strong>${escapeHtml(item.label)}</strong>
                            <span>${escapeHtml(item.phase)}</span>
                        </div>
                        <p>${escapeHtml(item.text)}</p>
                    </div>
                </div>
            `
        )
        .join("");
}

function syncMealCaloriesToIntake() {
    const total = calculateMealTotal(gatherRecordFromForm());
    element("record-intake").value = total || "";
    refreshEntrySummary();
    showToast(total ? `已按餐次热量回填 ${total} kcal。` : "三餐热量还没填完整。");
}

function syncExerciseCaloriesToBurn() {
    const totals = calculateExerciseTotals(state.record?.exerciseEntries || []);
    element("record-extra-burn").value = totals.calories ? Math.round(totals.calories) : "";
    refreshEntrySummary();
    showToast(totals.calories ? `已按训练明细回填 ${Math.round(totals.calories)} kcal。` : "还没有训练明细可回填。");
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
        state.record = await apiFetch(`/api/records/${dateValue}`, { method: "DELETE" });
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
        renderRecord();
        setPage("entry");
        closeDialog("import-dialog");
        if (result.skippedTypes?.length) {
            showToast(`已填充数据，但有未匹配模板被跳过：${result.skippedTypes.join("、")}`);
            return;
        }
        showToast("标准格式已解析并填充到表单。");
    } catch (error) {
        showToast(`解析失败：${error.message}`);
    }
}

function findExerciseType(typeId) {
    return state.exerciseTypes.find((item) => item.id === Number(typeId));
}

function renderTemplates() {
    const container = element("template-list");
    if (!state.exerciseTypes.length) {
        container.innerHTML = `<div class="empty-state">还没有运动模板，先新增一个吧。</div>`;
        return;
    }

    container.innerHTML = state.exerciseTypes
        .map((template) => {
            const fields = template.fields?.length
                ? template.fields
                    .map((field) => `<span class="pill">${escapeHtml(field.label)} ${escapeHtml(field.unit || "")}</span>`)
                    .join("")
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
        <label>
            <span>必填</span>
            <select data-field-role="required">
                <option value="false" ${field.required ? "" : "selected"}>否</option>
                <option value="true" ${field.required ? "selected" : ""}>是</option>
            </select>
        </label>
        <div class="field-actions">
            <button type="button" class="ghost danger" data-remove-field="true">删除</button>
        </div>
    `;
    wrapper.querySelector("[data-remove-field='true']").addEventListener("click", () => wrapper.remove());
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
            const typeName = findExerciseType(entry.exerciseTypeId)?.name || entry.exerciseTypeName || "未命名项目";
            const values = entry.values?.length
                ? entry.values
                    .map((value) => `<span class="pill">${escapeHtml(value.label)}：${escapeHtml(value.valueText)} ${escapeHtml(value.unit || "")}</span>`)
                    .join("")
                : `<span class="pill">无额外参数</span>`;

            return `
                <article class="entry-card">
                    <header>
                        <div>
                            <h4>${escapeHtml(typeName)}</h4>
                            <p class="muted">
                                ${formatMetric(entry.durationMinutes, "分钟")} / ${formatMetric(entry.caloriesBurned, "kcal")} / 强度 ${escapeHtml(entry.intensity || "未填")}
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
    if (!action || Number.isNaN(entryIndex)) {
        return;
    }

    if (action === "edit") {
        openEntryDialog(entryIndex);
        return;
    }

    if (action === "delete") {
        state.record.exerciseEntries.splice(entryIndex, 1);
        renderExerciseEntries();
        refreshEntrySummary();
        showToast("运动记录已移除。");
    }
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
        (entry?.values || []).flatMap((value) => [
            [value.fieldKey || value.label, value.valueText],
            [value.label, value.valueText],
        ])
    );
    renderEntryCustomFields(selectedTypeId, existingValueMap);
    element("entry-dialog").showModal();
}

function renderEntryCustomFields(typeId, existingValueMap = {}) {
    const container = element("entry-custom-fields");
    const exerciseType = findExerciseType(typeId);
    if (!exerciseType || !exerciseType.fields?.length) {
        container.innerHTML = `<div class="empty-state">这个模板没有额外参数。</div>`;
        return;
    }

    container.innerHTML = "";
    exerciseType.fields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "field-row compact";
        const currentValue = existingValueMap[field.fieldKey] ?? existingValueMap[field.label] ?? field.defaultValue ?? "";
        const inputType = field.fieldType === "text" ? "text" : "number";
        row.innerHTML = `
            <label>
                <span>${escapeHtml(field.label)}${field.unit ? ` (${escapeHtml(field.unit)})` : ""}</span>
                <input
                    type="${inputType}"
                    data-entry-field-key="${escapeHtml(field.fieldKey)}"
                    data-entry-field-label="${escapeHtml(field.label)}"
                    data-entry-field-unit="${escapeHtml(field.unit || "")}"
                    value="${escapeHtml(currentValue)}"
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
    const values = [...element("entry-custom-fields").querySelectorAll("[data-entry-field-key]")]
        .map((input) => ({
            fieldKey: input.dataset.entryFieldKey,
            label: input.dataset.entryFieldLabel,
            unit: input.dataset.entryFieldUnit,
            valueText: input.value.trim(),
        }))
        .filter((item) => item.valueText);

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

    state.record = state.record || createEmptyRecord(element("record-date").value || currentDateString());
    if (Number.isInteger(state.editingEntryIndex)) {
        state.record.exerciseEntries[state.editingEntryIndex] = payload;
    } else {
        state.record.exerciseEntries.push(payload);
    }

    renderExerciseEntries();
    refreshEntrySummary();
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
        ["总摄入热量", formatMetric(summary.totalIntakeCalories, "kcal")],
        ["总额外消耗", formatMetric(summary.totalExtraBurnCalories, "kcal")],
        ["总训练时长", formatMetric(summary.totalExerciseMinutes, "分钟")],
    ];

    element("stats-summary").innerHTML = cards
        .map(
            ([label, value]) => `
                <div class="metric-card compact">
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
        container.innerHTML = `<div class="empty-state">这个时间段还没有运动记录。</div>`;
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
        container.innerHTML = `<div class="empty-state">这个时间段还没有可查询的数据。</div>`;
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>体重</th>
                    <th>摄入</th>
                    <th>训练时长</th>
                    <th>训练消耗</th>
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
                                <td>${escapeHtml(formatDateLabel(row.date))}</td>
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
    const padding = { top: 24, right: 40, bottom: 48, left: 64 };
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

    const pathData = pointList
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    const gridLines = [0, 0.25, 0.5, 0.75, 1]
        .map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            const labelValue = (max - range * ratio).toFixed(1);
            return `
                <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(31, 85, 63, 0.12)" />
                <text x="12" y="${y + 4}" fill="#607061" font-size="12">${labelValue}</text>
            `;
        })
        .join("");

    const xLabels = pointList
        .map(
            (point) => `
                <text x="${point.x}" y="${height - 16}" text-anchor="middle" fill="#607061" font-size="12">
                    ${point.date.slice(5)}
                </text>
            `
        )
        .join("");

    const dots = pointList
        .map(
            (point) => `
                <circle cx="${point.x}" cy="${point.y}" r="5" fill="#1f5c46"></circle>
                <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" fill="#183626" font-size="12">
                    ${point.value}
                </text>
            `
        )
        .join("");

    svg.innerHTML = `
        <defs>
            <linearGradient id="chart-line" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#184e3a" />
                <stop offset="100%" stop-color="#2f8b66" />
            </linearGradient>
        </defs>
        ${gridLines}
        <path d="${pathData}" fill="none" stroke="url(#chart-line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
        ${dots}
        ${xLabels}
    `;
}

async function copyTodaySummary() {
    let exportResult = null;
    try {
        exportResult = await apiFetch("/api/exchange/export", {
            method: "POST",
            body: JSON.stringify({
                record: gatherRecordFromForm(),
            }),
        });
        await navigator.clipboard.writeText(exportResult.text);
        showToast("今日摘要已复制，你可以直接发给我分析。");
    } catch (error) {
        try {
            if (!exportResult) {
                exportResult = await apiFetch("/api/exchange/export", {
                    method: "POST",
                    body: JSON.stringify({
                        record: gatherRecordFromForm(),
                    }),
                });
            }
            window.prompt("复制下面这段内容发给我：", exportResult.text);
        } catch (fallbackError) {
            showToast(fallbackError.message);
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
