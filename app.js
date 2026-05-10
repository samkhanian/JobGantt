const DAY = 86400;
const WIDTH = 1200;

let allJobsData = [];
let currentFilter = 'all';

function toSeconds(t) {
  let p = t.split(":");
  return (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
}

function formatDuration(sec) {
  let mins = Math.floor(sec / 60);
  let remainingSec = sec % 60;
  if (mins === 0) return `${remainingSec}s`;
  return `${mins}m ${remainingSec}s`;
}

function getJobColor(jobName) {
  let hash = 0;
  for (let i = 0; i < jobName.length; i++) {
    hash = ((hash << 5) - hash) + jobName.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

// پیدا کردن گروه‌های همپوشانی (وصل کردن جاب‌هایی که با هم تداخل دارند)
function findOverlapGroups(data) {
  // آماده‌سازی ران‌ها
  let runs = data.map(job => ({
    name: job.name,
    start: toSeconds(job.start),
    end: toSeconds(job.end),
    startStr: job.start,
    endStr: job.end
  }));
  
  // ساخت گراف همپوشانی
  let graph = new Map();
  runs.forEach(run => {
    if (!graph.has(run.name)) {
      graph.set(run.name, new Set());
    }
  });
  
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[i].name !== runs[j].name) {
        if (runs[i].start < runs[j].end && runs[j].start < runs[i].end) {
          graph.get(runs[i].name).add(runs[j].name);
          graph.get(runs[j].name).add(runs[i].name);
        }
      }
    }
  }
  
  // پیدا کردن گروه‌های همبند (connected components)
  let visited = new Set();
  let groups = [];
  
  for (let [job, neighbors] of graph) {
    if (!visited.has(job) && neighbors.size > 0) {
      let group = [];
      let queue = [job];
      visited.add(job);
      
      while (queue.length > 0) {
        let current = queue.shift();
        group.push(current);
        
        let neighborsList = graph.get(current) || new Set();
        for (let neighbor of neighborsList) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      
      if (group.length > 1) {
        groups.push(group.sort());
      }
    }
  }
  
  return groups;
}

// محاسبه بازه‌های همپوشانی بین جاب‌های یک گروه
function calculateGroupOverlaps(groupJobs, allData) {
  let groupRuns = [];
  
  groupJobs.forEach(jobName => {
    let jobRuns = allData.filter(j => j.name === jobName);
    jobRuns.forEach(run => {
      groupRuns.push({
        name: jobName,
        start: toSeconds(run.start),
        end: toSeconds(run.end),
        startStr: run.start,
        endStr: run.end
      });
    });
  });
  
  // پیدا کردن تمام بازه‌هایی که حداقل 2 جاب با هم همپوشانی دارند
  let overlapSegments = [];
  
  for (let i = 0; i < groupRuns.length; i++) {
    for (let j = i + 1; j < groupRuns.length; j++) {
      if (groupRuns[i].name !== groupRuns[j].name) {
        let overlapStart = Math.max(groupRuns[i].start, groupRuns[j].start);
        let overlapEnd = Math.min(groupRuns[i].end, groupRuns[j].end);
        
        if (overlapStart < overlapEnd) {
          overlapSegments.push({
            start: overlapStart,
            end: overlapEnd,
            jobs: [groupRuns[i].name, groupRuns[j].name]
          });
        }
      }
    }
  }
  
  // ادغام بازه‌های همپوشانی مجاور
  overlapSegments.sort((a, b) => a.start - b.start);
  let merged = [];
  
  for (let seg of overlapSegments) {
    if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
      merged.push({...seg});
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      let allJobs = new Set([...merged[merged.length - 1].jobs, ...seg.jobs]);
      merged[merged.length - 1].jobs = [...allJobs];
    }
  }
  
  return merged;
}

fetch("jobs.xml")
  .then(r => r.text())
  .then(xmlText => {
    let parser = new DOMParser();
    let xml = parser.parseFromString(xmlText, "text/xml");
    let nodes = [...xml.getElementsByTagName("Job")];
    allJobsData = nodes.map(n => ({
      name: n.getAttribute("name"),
      start: n.getAttribute("start"),
      end: n.getAttribute("end")
    }));
    
    draw(allJobsData);
    setupFilters(allJobsData);
  });

function setupFilters(data) {
  const showAllBtn = document.getElementById('showAllBtn');
  const showOverlapBtn = document.getElementById('showOverlapBtn');
  const overlapInfo = document.getElementById('overlapInfo');
  
  const groups = findOverlapGroups(data);
  const overlappingJobCount = new Set(groups.flat()).size;
  overlapInfo.innerHTML = `🔴 ${groups.length} گروه همپوشان | ${overlappingJobCount} جاب`;
  
  showAllBtn.addEventListener('click', () => {
    currentFilter = 'all';
    showAllBtn.classList.add('active');
    showOverlapBtn.classList.remove('active');
    draw(data);
  });
  
  showOverlapBtn.addEventListener('click', () => {
    currentFilter = 'overlap';
    showAllBtn.classList.remove('active');
    showOverlapBtn.classList.add('active');
    const overlappingJobsSet = new Set(groups.flat());
    const filteredData = data.filter(job => overlappingJobsSet.has(job.name));
    draw(filteredData, groups);
  });
}

function draw(data, overlapGroups = []) {
  let jobsMap = new Map();
  data.forEach(job => {
    if (!jobsMap.has(job.name)) {
      jobsMap.set(job.name, []);
    }
    jobsMap.get(job.name).push({
      start: job.start,
      end: job.end
    });
  });
  
  let jobsSet = [...jobsMap.keys()].sort((a, b) => a.localeCompare(b));
  let chart = document.getElementById("chart");
  chart.innerHTML = "";

  // ساخت هدر ساعت‌ها
  let headerDiv = document.createElement("div");
  headerDiv.className = "timeline-header";
  for (let hour = 0; hour <= 24; hour++) {
    let marker = document.createElement("div");
    marker.className = "hour-marker";
    marker.innerText = `${hour.toString().padStart(2, '0')}:00`;
    headerDiv.appendChild(marker);
  }
  chart.appendChild(headerDiv);

  // محاسبه همپوشانی‌های هر گروه برای نمایش نوار قرمز
  let groupOverlaps = new Map();
  if (overlapGroups.length > 0) {
    overlapGroups.forEach(group => {
      let overlaps = calculateGroupOverlaps(group, data);
      group.forEach(jobName => {
        if (!groupOverlaps.has(jobName)) {
          groupOverlaps.set(jobName, []);
        }
        groupOverlaps.get(jobName).push(...overlaps);
      });
    });
  } else if (currentFilter === 'overlap') {
    // اگر فیلتر فعال است ولی گروهی نیست
  } else {
    // حالت all: همه همپوشانی‌ها را محاسبه کن
    let allGroups = findOverlapGroups(data);
    allGroups.forEach(group => {
      let overlaps = calculateGroupOverlaps(group, data);
      group.forEach(jobName => {
        if (!groupOverlaps.has(jobName)) {
          groupOverlaps.set(jobName, []);
        }
        groupOverlaps.get(jobName).push(...overlaps);
      });
    });
  }

  jobsSet.forEach(job => {
    let runs = jobsMap.get(job);
    let rowDiv = document.createElement("div");
    rowDiv.className = "row";
    rowDiv.setAttribute("data-job-name", job);
    
    let labelDiv = document.createElement("div");
    labelDiv.className = "label-area";

    let nameSpan = document.createElement("div");
    nameSpan.className = "job-name";
    nameSpan.innerText = job;

    let totalRuntimeSec = 0;
    runs.forEach(r => {
      let s = toSeconds(r.start);
      let e = toSeconds(r.end);
      if (e <= s) e = s + 1;
      totalRuntimeSec += (e - s);
    });

    let durationSpan = document.createElement("span");
    durationSpan.className = "duration-badge";
    durationSpan.innerText = runs.length ? formatDuration(totalRuntimeSec) : "--";

    labelDiv.appendChild(nameSpan);
    labelDiv.appendChild(durationSpan);
    rowDiv.appendChild(labelDiv);

    let barsContainer = document.createElement("div");
    barsContainer.className = "bars-container";
    barsContainer.style.position = "relative";
    barsContainer.style.height = "42px";

    if (runs.length === 0) {
      let noRunDiv = document.createElement("div");
      noRunDiv.className = "no-run";
      noRunDiv.innerText = "⛔ امروز اجرا نشده";
      rowDiv.appendChild(noRunDiv);
    } else {
      const jobColor = getJobColor(job);
      const jobOverlaps = groupOverlaps.get(job) || [];
      
      runs.forEach(r => {
        let s = toSeconds(r.start);
        let e = toSeconds(r.end);
        if (e <= s) e = s + 1;

        let left = (s / DAY) * WIDTH;
        let width = ((e - s) / DAY) * WIDTH;
        if (width < 3) width = 3;

        // نوار اصلی (آبی/رنگی)
        let bar = document.createElement("div");
        bar.className = "bar";
        bar.style.left = left + "px";
        bar.style.width = width + "px";
        bar.style.backgroundColor = jobColor;
        bar.style.height = "24px";
        bar.style.top = "9px";
        bar.style.borderRadius = "12px";
        
        let durationSec = e - s;
        bar.title = `${job}\n⏱️ شروع: ${r.start}  →  پایان: ${r.end}\n📏 مدت: ${formatDuration(durationSec)}`;
        
        barsContainer.appendChild(bar);
        
        // رسم نوارهای همپوشانی (قرمز و ضخیم‌تر)
        jobOverlaps.forEach(overlap => {
          // فقط همپوشانی‌هایی که با این ران تداخل دارند
          if (overlap.start < e && overlap.end > s) {
            let overlapStart = Math.max(overlap.start, s);
            let overlapEnd = Math.min(overlap.end, e);
            
            let overlapLeft = (overlapStart / DAY) * WIDTH;
            let overlapWidth = ((overlapEnd - overlapStart) / DAY) * WIDTH;
            
            if (overlapWidth > 2) {
              let overlapBar = document.createElement("div");
              overlapBar.className = "overlap-highlight-bar";
              overlapBar.style.position = "absolute";
              overlapBar.style.left = overlapLeft + "px";
              overlapBar.style.width = overlapWidth + "px";
              overlapBar.style.height = "32px";
              overlapBar.style.top = "5px";
              overlapBar.style.backgroundColor = "rgba(239, 68, 68, 0.85)";
              overlapBar.style.borderRadius = "14px";
              overlapBar.style.border = "2px solid #dc2626";
              overlapBar.style.boxShadow = "0 0 12px rgba(239,68,68,0.6)";
              overlapBar.style.zIndex = "12";
              overlapBar.style.cursor = "pointer";
              
              let overlapDuration = overlapEnd - overlapStart;
              let jobCount = overlap.jobs ? overlap.jobs.length : 2;
              overlapBar.title = `🔴 همپوشانی ${jobCount} جاب\n⏱️ مدت: ${formatDuration(overlapDuration)}\n📋 جاب‌های درگیر: ${overlap.jobs ? overlap.jobs.join(", ") : ""}`;
              
              barsContainer.appendChild(overlapBar);
            }
          }
        });
      });
    }
    
    rowDiv.appendChild(barsContainer);
    chart.appendChild(rowDiv);
  });
}