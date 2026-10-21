/* =====================================
   ExamSeat – single script (students, rooms, seating, dashboard)
===================================== */
"use strict";

const KEYS = {
  students: "examSeatStudents",
  rooms: "examSeatRooms",
  allocations: "examSeatAllocations"
};

let students = [];
let rooms = [];
let allocations = []; // { studentId, roomId, seat }
let studentSearch = "";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);

const esc = v => String(v).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function load(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data) ? data.filter(x => x && typeof x === "object") : [];
  } catch (e) {
    console.error(`Unable to load ${key}:`, e);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEYS.students, JSON.stringify(students));
    localStorage.setItem(KEYS.rooms, JSON.stringify(rooms));
    localStorage.setItem(KEYS.allocations, JSON.stringify(allocations));
    return true;
  } catch (e) {
    console.error(e);
    alert("Could not save data. Please check browser storage.");
    return false;
  }
}

function sortStudents(list) {
  return [...list].sort((a, b) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true, sensitivity: "base" })
  );
}

const studentById = id => students.find(s => s.id === id);
const roomById = id => rooms.find(r => r.id === id);
const occupied = roomId => allocations.filter(a => a.roomId === roomId).length;

/* ---------- navigation ---------- */
const TITLES = {
  dashboard: "Dashboard",
  students: "Students",
  rooms: "Examination Rooms",
  seating: "Seating Plan"
};

function showSection(name) {
  if (!TITLES[name]) name = "dashboard";

  document.querySelectorAll(".page-section").forEach(s =>
    s.classList.toggle("active", s.id === name)
  );
  document.querySelectorAll(".nav-link").forEach(l =>
    l.classList.toggle("active", l.dataset.section === name)
  );

  $("pageTitle").textContent = TITLES[name];
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  window.scrollTo(0, 0);
}

/* ---------- students ---------- */
function addStudent(e) {
  e.preventDefault();

  const name = $("studentName").value.trim();
  const rollNo = $("rollNo").value.trim();
  const course = $("studentCourse").value.trim();
  const exam = $("studentExam").value.trim();

  if (!name || !rollNo || !course || !exam) {
    alert("Please fill in all student details.");
    return;
  }

  if (students.some(s => s.rollNo.toLowerCase() === rollNo.toLowerCase())) {
    alert("This roll number already exists!");
    $("rollNo").focus();
    return;
  }

  students.push({ id: uid(), name, rollNo, course, exam });
  if (!save()) { students.pop(); return; }

  $("studentForm").reset();
  renderAll();
}

function deleteStudent(id) {
  const s = studentById(id);
  if (!s || !confirm(`Delete student "${s.name}" (${s.rollNo})?`)) return;

  students = students.filter(x => x.id !== id);
  allocations = allocations.filter(a => a.studentId !== id);
  save();
  renderAll();
}

function studentRow(s) {
  return `<tr>
    <td>${esc(s.rollNo)}</td>
    <td>${esc(s.name)}</td>
    <td>${esc(s.course)}</td>
    <td>${esc(s.exam)}</td>
    <td><button type="button" class="btn btn-danger delete-student-btn" data-id="${esc(s.id)}">
      <i class="fa-solid fa-trash"></i> Delete</button></td>
  </tr>`;
}

function renderStudents() {
  const q = studentSearch;
  const list = sortStudents(students).filter(s =>
    [s.name, s.rollNo, s.course, s.exam].some(v => v.toLowerCase().includes(q))
  );

  $("studentsTable").innerHTML = list.length
    ? list.map(studentRow).join("")
    : `<tr><td colspan="5" class="empty">${q ? "No matching students found." : "No students added yet."}</td></tr>`;

  const recent = students.slice(-5).reverse();
  $("recentStudentsTable").innerHTML = recent.length
    ? recent.map(studentRow).join("")
    : `<tr><td colspan="5" class="empty">No students added yet.</td></tr>`;
}

/* ---------- rooms ---------- */
function addRoom(e) {
  e.preventDefault();

  const name = $("roomName").value.trim();
  const capacity = Number($("roomCapacity").value);
  const building = $("roomBuilding").value.trim();

  if (!name) { alert("Please enter a room name."); return; }
  if (!Number.isInteger(capacity) || capacity <= 0) {
    alert("Room capacity must be a positive whole number.");
    return;
  }
  if (rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) {
    alert("A room with this name already exists.");
    return;
  }

  rooms.push({ id: uid(), name, capacity, building });
  if (!save()) { rooms.pop(); return; }

  $("roomForm").reset();
  renderAll();
}

function deleteRoom(id) {
  const r = roomById(id);
  if (!r || !confirm(`Delete examination room "${r.name}"? Its seat allocations will be removed.`)) return;

  rooms = rooms.filter(x => x.id !== id);
  allocations = allocations.filter(a => a.roomId !== id);
  save();
  renderAll();
}

function renderRooms() {
  $("roomsTable").innerHTML = rooms.length
    ? rooms.map(r => {
        const used = occupied(r.id);
        return `<tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.building || "—")}</td>
          <td>${r.capacity}</td>
          <td>${used}</td>
          <td>${r.capacity - used}</td>
          <td><button type="button" class="btn btn-danger delete-room-btn" data-id="${esc(r.id)}">
            <i class="fa-solid fa-trash"></i> Delete</button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6" class="empty">No rooms added yet.</td></tr>`;
}

/* ---------- seating plan ---------- */
function generatePlan() {
  if (!students.length) { alert("Please add students first."); return; }
  if (!rooms.length) { alert("Please add examination rooms first."); return; }

  if (allocations.length && !confirm("This will replace the current seating plan. Continue?")) return;

  const queue = sortStudents(students);
  const next = [];
  let i = 0;

  for (const room of rooms) {
    for (let seat = 1; seat <= room.capacity && i < queue.length; seat++, i++) {
      next.push({ studentId: queue[i].id, roomId: room.id, seat });
    }
    if (i >= queue.length) break;
  }

  allocations = next;
  save();
  renderAll();

  const left = queue.length - next.length;
  alert(left > 0
    ? `${next.length} students seated. ${left} student(s) could not be seated – add more room capacity.`
    : `Seating plan generated for ${next.length} students.`);
}

function clearPlan() {
  if (!allocations.length) return;
  if (!confirm("Clear the whole seating plan?")) return;
  allocations = [];
  save();
  renderAll();
}

function renderAllocations() {
  const rows = allocations
    .map(a => ({ a, s: studentById(a.studentId), r: roomById(a.roomId) }))
    .filter(x => x.s && x.r);

  $("allocationsTable").innerHTML = rows.length
    ? rows.map(({ a, s, r }) => `<tr>
        <td>${esc(s.rollNo)}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(r.name)}${r.building ? ` (${esc(r.building)})` : ""}</td>
        <td>${a.seat}</td>
        <td>${esc(s.exam)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="empty">No seating plan generated yet.</td></tr>`;
}

/* ---------- dashboard ---------- */
function bar(label, info, pct, cls = "") {
  return `<div class="bar-row">
    <div class="bar-label"><span>${esc(label)}</span><span>${esc(info)}</span></div>
    <div class="bar"><div class="${cls}" style="width:${Math.min(100, pct)}%"></div></div>
  </div>`;
}

function renderDashboard() {
  const total = students.length;
  const allocated = allocations.filter(a => studentById(a.studentId)).length;

  $("totalStudents").textContent = total;
  $("totalRooms").textContent = rooms.length;
  $("allocatedStudents").textContent = allocated;
  $("unallocatedStudents").textContent = total - allocated;

  $("studentChart").innerHTML = total
    ? bar("Allocated", `${allocated} / ${total}`, (allocated / total) * 100, "green") +
      bar("Unallocated", `${total - allocated} / ${total}`, ((total - allocated) / total) * 100, "full")
    : "<p>No allocation data available.</p>";

  $("roomChart").innerHTML = rooms.length
    ? rooms.map(r => {
        const used = occupied(r.id);
        return bar(r.name, `${used} / ${r.capacity} seats`, (used / r.capacity) * 100, used >= r.capacity ? "full" : "");
      }).join("")
    : "<p>No room data available.</p>";
}

function renderAll() {
  renderStudents();
  renderRooms();
  renderAllocations();
  renderDashboard();
}

/* ---------- demo data ---------- */
function loadDemoData() {
  if ((students.length || rooms.length) &&
      !confirm("Demo data will replace your current students, rooms and seating plan. Continue?")) return;

  const names = ["Aarav Sharma", "Riya Singh", "Kabir Khan", "Ananya Gupta", "Vihaan Verma",
    "Ishita Rao", "Arjun Mehta", "Sneha Patel", "Rohan Joshi", "Diya Nair",
    "Aditya Kumar", "Priya Das", "Karan Malhotra", "Meera Iyer", "Yash Tiwari"];
  const exams = ["Data Structures", "Operating Systems", "Database Systems"];

  students = names.map((name, i) => ({
    id: uid(),
    name,
    rollNo: `CS${String(i + 1).padStart(3, "0")}`,
    course: "B.Tech CSE",
    exam: exams[i % exams.length]
  }));

  rooms = [
    { id: uid(), name: "Room 101", capacity: 6, building: "Block A" },
    { id: uid(), name: "Room 102", capacity: 5, building: "Block A" },
    { id: uid(), name: "Room 201", capacity: 6, building: "Block B" }
  ];

  allocations = [];
  save();
  renderAll();
}

/* ---------- init ---------- */
function init() {
  students = load(KEYS.students).map(s => ({
    id: String(s.id ?? uid()),
    name: String(s.name ?? ""),
    rollNo: String(s.rollNo ?? ""),
    course: String(s.course ?? ""),
    exam: String(s.exam ?? "")
  }));

  rooms = load(KEYS.rooms).map(r => ({
    id: String(r.id ?? uid()),
    name: String(r.name ?? ""),
    capacity: Number(r.capacity) || 0,
    building: String(r.building ?? "")
  }));

  allocations = load(KEYS.allocations);

  // footer date/year
  $("currentDate").textContent = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
  $("currentYear").textContent = new Date().getFullYear();

  // forms
  $("studentForm").addEventListener("submit", addStudent);
  $("roomForm").addEventListener("submit", addRoom);
  $("studentSearch").addEventListener("input", e => {
    studentSearch = e.target.value.trim().toLowerCase();
    renderStudents();
  });

  // buttons
  $("generatePlanBtn").addEventListener("click", generatePlan);
  $("clearPlanBtn").addEventListener("click", clearPlan);
  $("printPlanBtn").addEventListener("click", () => {
    if (!allocations.length) { alert("Generate a seating plan first."); return; }
    showSection("seating");
    window.print();
  });
  $("demoBtn").addEventListener("click", loadDemoData);

  // navigation + delegated clicks
  document.querySelectorAll(".nav-link").forEach(link =>
    link.addEventListener("click", e => {
      e.preventDefault();
      showSection(link.dataset.section);
    })
  );

  document.addEventListener("click", e => {
    const goto = e.target.closest("[data-goto]");
    if (goto) return showSection(goto.dataset.goto);

    const delStudent = e.target.closest(".delete-student-btn");
    if (delStudent) return deleteStudent(delStudent.dataset.id);

    const delRoom = e.target.closest(".delete-room-btn");
    if (delRoom) deleteRoom(delRoom.dataset.id);
  });

  window.addEventListener("hashchange", () => showSection(location.hash.slice(1)));

  renderAll();
  showSection(location.hash.slice(1) || "dashboard");
}

document.addEventListener("DOMContentLoaded", init);
