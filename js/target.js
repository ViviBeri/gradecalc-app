// GradeCalc Target CGPA mode — client-side only, no network calls.
const SCENARIO_CREDITS = [24, 30, 36];
const MAX_GPA = 10;

function readNumber(id) {
  const input = document.getElementById(id);
  if (!input || input.value.trim() === "") return NaN;
  return Number(input.value);
}

function calculateRequiredSgpa({ currentCgpa, earnedCredits, targetCgpa, remainingCredits }) {
  const values = [currentCgpa, earnedCredits, targetCgpa, remainingCredits];
  if (!values.every(Number.isFinite)) {
    return { valid: false, reason: "Enter a value in every field." };
  }
  if (currentCgpa < 0 || currentCgpa > MAX_GPA || targetCgpa < 0 || targetCgpa > MAX_GPA) {
    return { valid: false, reason: "CGPA values must be between 0 and 10." };
  }
  if (earnedCredits < 0) {
    return { valid: false, reason: "Credits earned cannot be negative." };
  }
  if (remainingCredits <= 0) {
    return { valid: false, reason: "Credits remaining must be greater than zero." };
  }

  const requiredSgpa =
    (targetCgpa * (earnedCredits + remainingCredits) - currentCgpa * earnedCredits) /
    remainingCredits;

  if (!Number.isFinite(requiredSgpa)) {
    return { valid: false, reason: "Unable to calculate with these values." };
  }
  return {
    valid: true,
    requiredSgpa,
    achievable: requiredSgpa <= MAX_GPA,
    alreadyAboveTarget: currentCgpa >= targetCgpa,
    requiredWithinScale: requiredSgpa <= MAX_GPA && requiredSgpa >= 0
  };
}

function escapeTargetText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function guidanceFor(requiredSgpa, currentCgpa, targetCgpa) {
  if (requiredSgpa > MAX_GPA) return "This target is not mathematically reachable with the credits entered. Try a lower target or check your credit totals.";
  if (requiredSgpa <= 0) return "Your existing credit points are already enough for this target, even with a zero average on the remaining credits.";
  if (currentCgpa >= targetCgpa) return "You're ahead of your target. Aim to maintain at least this average to finish at your goal.";
  if (requiredSgpa >= 9) return "A stretch goal. Prioritise A+ and O grades and plan each subject carefully.";
  if (requiredSgpa >= 8) return "You're within reach. Consistent A and A+ grades will help you get there.";
  if (requiredSgpa >= 6) return "A steady, consistent semester can put this goal within reach.";
  return "Your target leaves room to build steadily. Keep your progress consistent.";
}

function formatRequired(result) {
  if (result.requiredSgpa > MAX_GPA) return "Above 10";
  if (result.requiredSgpa <= 0) return "0.00 / 10";
  return result.requiredSgpa.toFixed(2) + " / 10";
}

function statusFor(result) {
  if (result.requiredSgpa > MAX_GPA) return { label: "Not achievable with these credits", tone: "bad", icon: "⚠" };
  if (result.requiredSgpa >= 9) return { label: "Stretch goal", tone: "warn", icon: "↗" };
  if (result.alreadyAboveTarget) return { label: "You're ahead of your target", tone: "good", icon: "✓" };
  return { label: "Achievable with a plan", tone: "good", icon: "✓" };
}

function scenarioMarkup(credits, result) {
  const title = credits + " remaining credits";
  if (!result.valid) {
    return '<div class="target-scenario"><div class="target-scenario-title">' + title +
      '</div><div class="target-error">' + escapeTargetText(result.reason) + '</div></div>';
  }
  const impossible = result.requiredSgpa > MAX_GPA;
  const required = impossible ? 10 : Math.max(0, result.requiredSgpa);
  const note = impossible
    ? "Even an average of 10.00 would not reach the target."
    : guidanceFor(result.requiredSgpa, result.currentCgpa, result.targetCgpa);
  return '<div class="target-scenario">' +
    '<div class="target-scenario-top"><span class="target-scenario-title">' + title +
    '</span><span class="target-scenario-value">' + escapeTargetText(formatRequired(result)) + '</span></div>' +
    '<div class="target-meter" role="img" aria-label="Required SGPA ' + escapeTargetText(impossible ? "exceeds 10" : required.toFixed(2) + " out of 10") + '">' +
    '<div class="target-meter-fill" style="width:' + Math.min(100, Math.max(0, required / MAX_GPA * 100)) + '%"></div></div>' +
    '<div class="target-scenario-note">' + escapeTargetText(note) + '</div></div>';
}

function renderTarget() {
  const currentCgpa = readNumber("target-current-cgpa");
  const targetCgpa = readNumber("target-goal-cgpa");
  const earnedCredits = readNumber("target-earned-credits");
  const remainingCredits = readNumber("target-remaining-credits");
  const params = { currentCgpa, earnedCredits, targetCgpa, remainingCredits };
  const main = document.getElementById("target-main-result");
  const scenarios = document.getElementById("target-scenarios");
  const result = calculateRequiredSgpa(params);

  if (!result.valid) {
    main.innerHTML = '<div class="target-result-card"><div class="target-error" role="alert">' +
      escapeTargetText(result.reason) + '</div></div>';
  } else {
    const status = statusFor(result);
    const note = guidanceFor(result.requiredSgpa, currentCgpa, targetCgpa);
    main.innerHTML = '<div class="target-result-card">' +
      '<div class="target-status ' + status.tone + '">' + status.icon + ' ' + status.label + '</div>' +
      '<div class="target-result-label">Required average SGPA</div>' +
      '<div class="target-result-number">' + escapeTargetText(formatRequired(result)) + '</div>' +
      '<div class="target-result-caption">' + escapeTargetText(note) + '</div>' +
      '<div class="target-result-caption" style="margin-top:10px">Based on ' +
      escapeTargetText(earnedCredits) + ' earned credits and ' + escapeTargetText(remainingCredits) +
      ' remaining credits.</div></div>';
  }

  scenarios.innerHTML = SCENARIO_CREDITS.map((credits) => {
    const scenario = calculateRequiredSgpa({
      currentCgpa,
      earnedCredits,
      targetCgpa,
      remainingCredits: credits
    });
    return scenarioMarkup(credits, scenario);
  }).join("");
}

function resetTarget() {
  document.getElementById("target-current-cgpa").value = "7.8";
  document.getElementById("target-goal-cgpa").value = "8.5";
  document.getElementById("target-earned-credits").value = "120";
  document.getElementById("target-remaining-credits").value = "60";
  renderTarget();
}

document.addEventListener("DOMContentLoaded", () => {
  ["target-current-cgpa", "target-goal-cgpa", "target-earned-credits", "target-remaining-credits"]
    .forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("input", renderTarget);
    });
  document.getElementById("target-calculate")?.addEventListener("click", renderTarget);
  document.getElementById("target-reset")?.addEventListener("click", resetTarget);
  renderTarget();
});

// Expose calculation for automated tests without coupling it to the UI.
if (typeof globalThis !== "undefined") {
  globalThis.GradeCalcTarget = { calculateRequiredSgpa };
}
