/* Local-only academic analytics for GradeCalc. No network or backend required. */
(function () {
  'use strict';

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function currentSubjects() {
    return (window.subjects || []).filter(function (item) {
      var credits = Number(item.credits);
      return item && item.credits !== '' && Number.isFinite(credits) && credits > 0;
    }).map(function (item) {
      var grade = window.marksToGrade(item.marks);
      return {name:item.name || 'Unnamed subject', marks:item.marks, credits:Number(item.credits), grade:grade.label, point:grade.point};
    });
  }

  function semesterValues() {
    return (window.semesters || []).map(function (item, index) {
      var value = item && String(item.sgpa == null ? '' : item.sgpa).trim();
      return {label:'Semester ' + (index + 1), value:value === '' ? null : Number(value)};
    }).filter(function (item) {
      return item.value !== null && Number.isFinite(item.value) && item.value >= 0 && item.value <= 10;
    });
  }

  function metric(label, value, note) {
    return '<div class="card" style="margin:0;min-width:0"><div class="card-title">' + label + '</div>' +
      '<div style="font:800 25px var(--mono);color:var(--accent)">' + value + '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:4px">' + note + '</div></div>';
  }

  function trendSvg(values) {
    if (!values.length) return '<p style="font-size:12px;color:var(--muted)">Enter semester SGPAs in the CGPA tab to see your trend.</p>';
    var width = 320, height = 150, left = 26, right = 12, top = 12, bottom = 28;
    var points = values.map(function (item, index) {
      var x = values.length === 1 ? (left + width - right) / 2 : left + index * (width - left - right) / (values.length - 1);
      var y = top + (10 - item.value) * (height - top - bottom) / 10;
      return {x:x,y:y,item:item};
    });
    var polyline = points.map(function (point) { return point.x + ',' + point.y; }).join(' ');
    var dots = points.map(function (point) {
      return '<circle cx="' + point.x + '" cy="' + point.y + '" r="4" fill="var(--accent2)"><title>' +
        safe(point.item.label + ': ' + point.item.value.toFixed(2)) + '</title></circle>';
    }).join('');
    var labels = points.map(function (point) {
      return '<text x="' + point.x + '" y="' + (height - 7) + '" text-anchor="middle" fill="var(--muted)" font-size="9">' +
        safe(point.item.label.replace('Semester ', 'S')) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Semester SGPA trend chart" style="width:100%;height:auto;overflow:visible">' +
      '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (height-bottom) + '" stroke="var(--border)"/>' +
      '<line x1="' + left + '" y1="' + (height-bottom) + '" x2="' + (width-right) + '" y2="' + (height-bottom) + '" stroke="var(--border)"/>' +
      '<polyline points="' + polyline + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + dots + labels + '</svg>';
  }

  function renderAnalytics() {
    var host = document.getElementById('analytics-content');
    if (!host) return;
    var subjects = currentSubjects();
    var semesters = semesterValues();
    var totalCredits = subjects.reduce(function (sum, item) { return sum + item.credits; }, 0);
    var weighted = subjects.reduce(function (sum, item) { return sum + item.credits * item.point; }, 0);
    var currentSgpa = totalCredits ? weighted / totalCredits : null;
    var average = semesters.length ? semesters.reduce(function (sum, item) { return sum + item.value; }, 0) / semesters.length : null;
    var best = semesters.length ? Math.max.apply(null, semesters.map(function (item) { return item.value; })) : null;
    var grades = ['O','A+','A','B+','B','C','P','F','Ab'];
    var counts = {};
    grades.forEach(function (grade) { counts[grade] = 0; });
    subjects.forEach(function (item) { counts[item.grade] = (counts[item.grade] || 0) + 1; });
    var distribution = grades.map(function (grade) {
      var count = counts[grade];
      if (!count) return '';
      var percent = subjects.length ? count / subjects.length * 100 : 0;
      return '<div style="display:flex;align-items:center;gap:8px;margin:8px 0"><span style="width:28px;font:700 11px var(--mono)">' +
        grade + '</span><div style="height:9px;flex:1;background:var(--border);border-radius:8px;overflow:hidden"><div style="height:100%;width:' +
        percent + '%;background:var(--accent);border-radius:8px"></div></div><span style="width:24px;text-align:right;font:11px var(--mono)">' + count + '</span></div>';
    }).join('');
    var subjectRows = subjects.map(function (item) {
      return '<tr><td>' + safe(item.name) + '</td><td>' + safe(item.marks === '' ? 'Ab' : item.marks) +
        '</td><td>' + item.grade + '</td><td>' + item.point + '</td><td>' + item.credits + '</td></tr>';
    }).join('');
    host.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:12px">' +
      metric('Current subject SGPA', currentSgpa === null ? '—' : currentSgpa.toFixed(2), 'Weighted from entered subjects') +
      metric('Entered semesters', String(semesters.length), 'Valid SGPA values') +
      metric('Semester average', average === null ? '—' : average.toFixed(2), 'Unweighted average, same as app CGPA') +
      metric('Best semester', best === null ? '—' : best.toFixed(2), 'Highest entered SGPA') + '</div>' +
      '<div class="card"><div class="card-title">Semester performance trend</div>' + trendSvg(semesters) + '</div>' +
      '<div class="card"><div class="card-title">Current subject grade distribution</div>' +
      (distribution || '<p style="font-size:12px;color:var(--muted)">Add subjects with credits in the SGPA tab to see grade distribution.</p>') + '</div>' +
      '<div class="card"><div class="card-title">Current subject comparison</div>' +
      (subjectRows ? '<div style="overflow-x:auto"><table class="breakdown-table"><thead><tr><th>Subject</th><th>Marks</th><th>Grade</th><th>GP</th><th>Cr</th></tr></thead><tbody>' +
      subjectRows + '</tbody></table></div>' : '<p style="font-size:12px;color:var(--muted)">No subject data yet.</p>') + '</div>' +
      '<button class="btn-primary" style="width:100%;margin-bottom:12px" onclick="exportGradeCalcAnalytics()">Export analytics CSV</button>' +
      '<p style="font-size:10px;color:var(--muted);text-align:center">Analytics are calculated on this device from your locally saved entries. No data is uploaded.</p>';
  }

  function exportGradeCalcAnalytics() {
    var rows = [['record_type','label','sgpa','marks','grade','grade_point','credits']];
    (window.semesters || []).forEach(function (item, index) {
      var value = item && String(item.sgpa == null ? '' : item.sgpa).trim();
      if (value !== '') rows.push(['semester','Semester ' + (index + 1),value,'','','','']);
    });
    currentSubjects().forEach(function (item) {
      rows.push(['subject',item.name,'',item.marks,item.grade,item.point,item.credits]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (value) {
        var text = String(value == null ? '' : value);
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'gradecalc-analytics.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  window.renderAnalytics = renderAnalytics;
  window.exportGradeCalcAnalytics = exportGradeCalcAnalytics;
})();
