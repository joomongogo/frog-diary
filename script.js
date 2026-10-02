// Frog AI Diary v0.1
// 개구리 프로필과 사육 일기를 이 브라우저 안에만 저장합니다.

// --- 저장 키 ---
const STORAGE_KEYS = {
  frogs: "frogDiary.frogs",
  entries: "frogDiary.entries",
  // 예전 버전은 개구리 한 마리만 이 키에 저장했습니다.
  legacyProfile: "frogDiary.profile",
};

const MAX_FROGS = 10;

// 긴 변을 이 길이에 맞추고, JPEG로 줄여서 용량을 낮춥니다.
const MAX_IMAGE_EDGE = 800;
const JPEG_QUALITY = 0.7;

// 오늘 일기 폼에서 고른 사진. 저장 버튼을 누르기 전에는 메모리에만 있습니다.
let entryPhotoData = null;
let entryPhotoToken = 0;
let profileSavedTimer = null;
// 등록된 개구리 목록과, 지금 고른 개구리입니다.
let frogs = [];
let selectedId = "";
let profile = { name: "", photo: null };

const profileNameInput = document.getElementById("frog-name");
const profileDisplayName = document.getElementById("profile-display-name");
const profilePhotoInput = document.getElementById("profile-photo-input");
const profilePhoto = document.getElementById("profile-photo");
const profilePlaceholder = document.getElementById("profile-placeholder");
const profileSaved = document.getElementById("profile-saved");
const frogBarList = document.getElementById("frog-bar-list");
const addFrogButton = document.getElementById("add-frog-button");
const deleteFrogButton = document.getElementById("delete-frog-button");
const todayTitle = document.getElementById("today-title");
const historyTitle = document.getElementById("history-title");

const diaryForm = document.getElementById("diary-form");
const entryDateInput = document.getElementById("entry-date");
const entryPhotoInput = document.getElementById("entry-photo-input");
const entryPhotoPreview = document.getElementById("entry-photo-preview");
const entryPhotoPlaceholder = document.getElementById("entry-photo-placeholder");
const entryFoodInput = document.getElementById("entry-food");
const entryAmountInput = document.getElementById("entry-amount");
const entryMemoInput = document.getElementById("entry-memo");
const formMessage = document.getElementById("form-message");
const entryList = document.getElementById("entry-list");

// --- localStorage 읽기 / 쓰기 ---

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    // 사진이 많거나 크면 브라우저 저장 한도를 넘을 수 있습니다.
    window.alert("사진이 너무 커서 저장하지 못했어요. 더 작은 사진을 골라 주세요.");
    return false;
  }
}

function isSafeImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function normalizeFrog(frog) {
  return {
    id: frog && typeof frog.id === "string" ? frog.id : makeId(),
    name: frog && typeof frog.name === "string" ? frog.name : "",
    photo: frog && isSafeImage(frog.photo) ? frog.photo : null,
  };
}

function currentFrog() {
  const found = frogs.find(function (frog) {
    return frog.id === selectedId;
  });
  return found || frogs[0];
}

function saveFrogs() {
  return writeJson(STORAGE_KEYS.frogs, {
    selectedId: selectedId,
    frogs: frogs,
  });
}

function loadAllEntries() {
  const data = readJson(STORAGE_KEYS.entries, []);
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(function (entry) {
    return entry && typeof entry.id === "string" && typeof entry.date === "string";
  });
}

// 지금 고른 개구리의 일기만 돌려줍니다.
function loadEntries() {
  const frogId = currentFrog().id;
  return loadAllEntries().filter(function (entry) {
    return entry.frogId === frogId;
  });
}

// 다른 개구리의 일기는 그대로 두고, 지금 개구리 일기만 바꿉니다.
function saveEntries(entriesForFrog) {
  const frogId = currentFrog().id;
  const others = loadAllEntries().filter(function (entry) {
    return entry.frogId !== frogId;
  });
  return writeJson(STORAGE_KEYS.entries, others.concat(entriesForFrog));
}

function loadFrogs() {
  const saved = readJson(STORAGE_KEYS.frogs, null);
  if (saved && Array.isArray(saved.frogs) && saved.frogs.length > 0) {
    frogs = saved.frogs.slice(0, MAX_FROGS).map(normalizeFrog);
    const stillThere = frogs.some(function (frog) {
      return frog.id === saved.selectedId;
    });
    selectedId = stillThere ? saved.selectedId : frogs[0].id;
    return;
  }

  // 예전에 저장해 둔 개구리 한 마리가 있으면 첫 개구리로 가져옵니다.
  const oldProfile = readJson(STORAGE_KEYS.legacyProfile, null);
  const first = normalizeFrog({
    id: makeId(),
    name: oldProfile && oldProfile.name,
    photo: oldProfile && oldProfile.photo,
  });
  frogs = [first];
  selectedId = first.id;

  const entries = loadAllEntries().map(function (entry) {
    if (!entry.frogId) {
      entry.frogId = first.id;
    }
    return entry;
  });
  saveFrogs();
  writeJson(STORAGE_KEYS.entries, entries);
  try {
    localStorage.removeItem(STORAGE_KEYS.legacyProfile);
  } catch (error) {
    // 예전 키를 지우지 못해도 새 저장은 이미 끝났습니다.
  }
}

// --- 날짜 ---

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function formatDate(isoDate) {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  return Number(parts[0]) + "년 " + Number(parts[1]) + "월 " + Number(parts[2]) + "일";
}

// --- 사진 축소 ---

function resizeImage(file) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      reject(new Error("not-image"));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = function () {
      const longest = Math.max(image.width, image.height);
      if (!longest) {
        URL.revokeObjectURL(url);
        reject(new Error("empty-image"));
        return;
      }

      const scale = Math.min(1, MAX_IMAGE_EDGE / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      // JPEG는 투명 배경이 검게 보이므로 흰색을 먼저 칠합니다.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };

    image.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("load-failed"));
    };

    image.src = url;
  });
}

function showPhoto(imageElement, placeholderElement, dataUrl) {
  if (isSafeImage(dataUrl)) {
    imageElement.src = dataUrl;
    imageElement.hidden = false;
    placeholderElement.hidden = true;
    return;
  }
  imageElement.removeAttribute("src");
  imageElement.hidden = true;
  placeholderElement.hidden = false;
}

// --- 프로필 ---

function showProfileSaved() {
  profileSaved.hidden = false;
  window.clearTimeout(profileSavedTimer);
  profileSavedTimer = window.setTimeout(function () {
    profileSaved.hidden = true;
  }, 1500);
}

function frogLabel(frog) {
  return frog.name || "이름 없음";
}

function renderFrogBar() {
  frogBarList.textContent = "";
  frogs.forEach(function (frog) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frog-chip" + (frog.id === selectedId ? " is-selected" : "");
    button.setAttribute("aria-pressed", frog.id === selectedId ? "true" : "false");

    const photo = document.createElement("span");
    photo.className = "frog-chip-photo";
    if (isSafeImage(frog.photo)) {
      const image = document.createElement("img");
      image.src = frog.photo;
      image.alt = "";
      photo.appendChild(image);
    } else {
      photo.textContent = "🐸";
    }

    const name = document.createElement("span");
    name.className = "frog-chip-name";
    name.textContent = frogLabel(frog);
    button.appendChild(photo);
    button.appendChild(name);
    button.addEventListener("click", function () {
      selectFrog(frog.id);
    });
    frogBarList.appendChild(button);
  });

  const full = frogs.length >= MAX_FROGS;
  addFrogButton.disabled = full;
  addFrogButton.title = full ? "개구리는 10마리까지만 등록할 수 있어요." : "개구리 추가";
  const selectedChip = frogBarList.querySelector(".is-selected");
  if (selectedChip) {
    selectedChip.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
}

function updateSectionTitles() {
  const name = profile.name.trim();
  todayTitle.textContent = name ? name + "의 오늘 일기" : "오늘의 사육 일기";
  historyTitle.textContent = name ? name + "의 이전 일기" : "이전 사육 일기";
}

function renderProfile() {
  profile = currentFrog();
  profileNameInput.value = profile.name;
  profileDisplayName.textContent = profile.name || "이름을 적어 주세요";
  showPhoto(profilePhoto, profilePlaceholder, profile.photo);
  deleteFrogButton.hidden = frogs.length <= 1;
  renderFrogBar();
  updateSectionTitles();
}

function commitProfileName() {
  const name = profileNameInput.value.trim();
  profileDisplayName.textContent = name || "이름을 적어 주세요";
  if (profile.name === name) {
    updateSectionTitles();
    return true;
  }
  const previousName = profile.name;
  profile.name = name;
  if (!saveFrogs()) {
    profile.name = previousName;
    profileDisplayName.textContent = previousName || "이름을 적어 주세요";
    return false;
  }
  // 바를 바로 다시 그리면, 이름 칸에서 다른 개구리를 누를 때 클릭이 사라집니다.
  window.setTimeout(function () {
    renderFrogBar();
    updateSectionTitles();
  }, 0);
  showProfileSaved();
  return true;
}

async function onProfilePhotoChange() {
  const file = profilePhotoInput.files && profilePhotoInput.files[0];
  if (!file) {
    return;
  }

  try {
    const photo = await resizeImage(file);
    // 사진을 줄이는 동안 이름을 바꿨을 수 있어서, 입력창의 이름을 함께 저장합니다.
    const name = profileNameInput.value.trim();
    const previousName = profile.name;
    const previousPhoto = profile.photo;
    profile.name = name;
    profile.photo = photo;
    if (!saveFrogs()) {
      profile.name = previousName;
      profile.photo = previousPhoto;
      return;
    }
    profileDisplayName.textContent = name || "이름을 적어 주세요";
    showPhoto(profilePhoto, profilePlaceholder, photo);
    renderFrogBar();
    updateSectionTitles();
    showProfileSaved();
  } catch (error) {
    window.alert("사진을 읽지 못했어요. 다른 사진을 골라 주세요.");
  } finally {
    profilePhotoInput.value = "";
  }
}

// --- 이전 일기 카드 ---

function sortEntries(entries) {
  return entries.slice().sort(function (a, b) {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return (b.savedAt || 0) - (a.savedAt || 0);
  });
}

function addField(parent, label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label + ": ";
  paragraph.appendChild(strong);
  paragraph.appendChild(document.createTextNode(value || "기록 안 함"));
  parent.appendChild(paragraph);
  return paragraph;
}

function createEntryCard(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";

  const title = document.createElement("h3");
  title.textContent = formatDate(entry.date);
  card.appendChild(title);

  if (isSafeImage(entry.photo)) {
    const image = document.createElement("img");
    image.className = "entry-photo";
    image.src = entry.photo;
    image.alt = formatDate(entry.date) + " 개구리 사진";
    card.appendChild(image);
  } else {
    const emptyPhoto = document.createElement("p");
    emptyPhoto.className = "entry-photo-empty";
    emptyPhoto.textContent = "사진 없음";
    card.appendChild(emptyPhoto);
  }

  addField(card, "먹은 먹이", entry.food);
  addField(card, "먹은 양", entry.amount);
  const memo = addField(card, "상태 / 행동 메모", entry.memo);
  memo.classList.add("memo");

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", function () {
    deleteEntry(entry.id);
  });
  card.appendChild(deleteButton);

  return card;
}

function renderEntries() {
  const entries = sortEntries(loadEntries());
  entryList.textContent = "";

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "아직 작성한 사육 일기가 없습니다.";
    entryList.appendChild(empty);
    return;
  }

  entries.forEach(function (entry) {
    entryList.appendChild(createEntryCard(entry));
  });
}

function deleteEntry(id) {
  const ok = window.confirm("이 기록을 삭제할까요?");
  if (!ok) {
    return;
  }
  const next = loadEntries().filter(function (entry) {
    return entry.id !== id;
  });
  if (!saveEntries(next)) {
    return;
  }
  renderEntries();
}

function makeId() {
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
}

function selectFrog(id) {
  if (id === selectedId) {
    return;
  }
  if (!commitProfileName()) {
    return;
  }
  const previousId = selectedId;
  selectedId = id;
  profile = currentFrog();
  if (!saveFrogs()) {
    selectedId = previousId;
    profile = currentFrog();
    return;
  }
  profileSaved.hidden = true;
  resetDiaryForm();
  formMessage.hidden = true;
  renderProfile();
  renderEntries();
}

function addFrog() {
  if (frogs.length >= MAX_FROGS) {
    window.alert("개구리는 10마리까지만 등록할 수 있어요.");
    return;
  }
  if (!commitProfileName()) {
    return;
  }
  const previousId = selectedId;
  const frog = normalizeFrog({ id: makeId(), name: "", photo: null });
  frogs.push(frog);
  selectedId = frog.id;
  profile = frog;
  if (!saveFrogs()) {
    frogs.pop();
    selectedId = previousId;
    profile = currentFrog();
    return;
  }
  profileSaved.hidden = true;
  resetDiaryForm();
  formMessage.hidden = true;
  renderProfile();
  renderEntries();
  profileNameInput.focus();
}

function deleteCurrentFrog() {
  if (frogs.length <= 1) {
    return;
  }
  const ok = window.confirm("이 개구리를 지울까요? 이 개구리의 사육 일기도 함께 지워져요.");
  if (!ok) {
    return;
  }

  const removedId = selectedId;
  const previousFrogs = frogs.slice();
  const previousId = selectedId;
  const previousEntries = loadAllEntries();
  const remainingEntries = previousEntries.filter(function (entry) {
    return entry.frogId !== removedId;
  });

  frogs = frogs.filter(function (frog) {
    return frog.id !== removedId;
  });
  selectedId = frogs[0].id;
  profile = currentFrog();

  if (!saveFrogs()) {
    frogs = previousFrogs;
    selectedId = previousId;
    profile = currentFrog();
    return;
  }
  if (!writeJson(STORAGE_KEYS.entries, remainingEntries)) {
    frogs = previousFrogs;
    selectedId = previousId;
    profile = currentFrog();
    saveFrogs();
    return;
  }

  profileSaved.hidden = true;
  resetDiaryForm();
  formMessage.hidden = true;
  renderProfile();
  renderEntries();
}

function showFormMessage(text, isError) {
  formMessage.hidden = false;
  formMessage.textContent = text;
  formMessage.classList.toggle("is-error", Boolean(isError));
}

function resetDiaryForm() {
  entryPhotoToken += 1;
  diaryForm.reset();
  entryDateInput.value = todayString();
  entryPhotoData = null;
  showPhoto(entryPhotoPreview, entryPhotoPlaceholder, null);
}

async function onEntryPhotoChange() {
  const file = entryPhotoInput.files && entryPhotoInput.files[0];
  const token = ++entryPhotoToken;
  if (!file) {
    entryPhotoData = null;
    showPhoto(entryPhotoPreview, entryPhotoPlaceholder, null);
    return;
  }

  // 새 사진을 줄이는 동안에는 이전 사진이 저장되지 않게 비워 둡니다.
  entryPhotoData = null;
  showPhoto(entryPhotoPreview, entryPhotoPlaceholder, null);

  try {
    const photo = await resizeImage(file);
    // 더 나중에 고른 사진이 있으면 이전 결과는 버립니다.
    if (token !== entryPhotoToken) {
      return;
    }
    entryPhotoData = photo;
    showPhoto(entryPhotoPreview, entryPhotoPlaceholder, photo);
  } catch (error) {
    if (token !== entryPhotoToken) {
      return;
    }
    entryPhotoData = null;
    showPhoto(entryPhotoPreview, entryPhotoPlaceholder, null);
    entryPhotoInput.value = "";
    window.alert("사진을 읽지 못했어요. 다른 사진을 골라 주세요.");
  }
}

function onDiarySubmit(event) {
  event.preventDefault();

  if (entryPhotoInput.files && entryPhotoInput.files[0] && !entryPhotoData) {
    showFormMessage("사진을 줄이는 중이에요. 잠시 후 다시 눌러 주세요.", true);
    return;
  }

  const date = entryDateInput.value;
  const food = entryFoodInput.value.trim();
  const amount = entryAmountInput.value.trim();
  const memo = entryMemoInput.value.trim();

  if (!date) {
    showFormMessage("날짜를 골라 주세요.", true);
    return;
  }

  if (!entryPhotoData && !food && !amount && !memo) {
    showFormMessage("사진, 먹이, 양, 메모 중 하나는 적어 주세요.", true);
    return;
  }

  const entries = loadEntries();
  entries.push({
    id: makeId(),
    frogId: currentFrog().id,
    date: date,
    photo: entryPhotoData,
    food: food,
    amount: amount,
    memo: memo,
    savedAt: Date.now(),
  });

  if (!saveEntries(entries)) {
    return;
  }

  resetDiaryForm();
  showFormMessage("오늘의 기록을 저장했어요.", false);
  renderEntries();
}

// --- 다음 버전용 ---
// AI 조언을 만들 때는 이 함수로 최근 기록을 읽으면 됩니다.
// 만든 문장은 index.html의 "AI 조언" 주석 자리에 보여 주면 됩니다.
// v0.1에서는 이 함수를 호출하지 않습니다.
function readRecentEntriesForAdvice(limit) {
  const count = limit || 7;
  return sortEntries(loadEntries()).slice(0, count);
}

// 나중에 다른 스크립트에서 찾을 수 있게 이름만 남겨 둡니다.
window.frogDiaryFuture = {
  readRecentEntriesForAdvice: readRecentEntriesForAdvice,
};

// --- 시작 ---

profileNameInput.addEventListener("blur", commitProfileName);
profileNameInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    profileNameInput.blur();
  }
});
profilePhotoInput.addEventListener("change", onProfilePhotoChange);
addFrogButton.addEventListener("click", addFrog);
deleteFrogButton.addEventListener("click", deleteCurrentFrog);
entryPhotoInput.addEventListener("change", onEntryPhotoChange);
diaryForm.addEventListener("submit", onDiarySubmit);

entryDateInput.value = todayString();
loadFrogs();
renderProfile();
renderEntries();
