// 多语言系统 - 共享脚本

let translations = {};
let currentLang = localStorage.getItem('language') || 'zh';

// 语言标识映射
const langFlags = {
  zh: '🇨🇳',
  en: '🇺🇸',
  fr: '🇫🇷',
  ja: '🇯🇵',
  es: '🇪🇸'
};

const langNames = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  ja: '日本語',
  es: 'Español'
};

// 加载翻译文件
async function loadTranslations() {
  try {
    const response = await fetch('./assets/i18n.json');
    translations = await response.json();
    updatePageLanguage(currentLang);
  } catch (error) {
    console.error('加载翻译文件失败:', error);
  }
}

// 更新页面语言
function updatePageLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('language', lang);
  
  const t = translations[lang];
  if (!t) return;
  
  // 更新所有带 data-i18n 的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const keys = key.split('.');
    let value = t;
    
    for (const k of keys) {
      value = value[k];
      if (!value) break;
    }
    
    if (value) {
      el.textContent = value;
    }
  });
  
  // 更新语言按钮（如果存在）
  const flagEl = document.getElementById('current-lang-flag');
  const codeEl = document.getElementById('current-lang-code');
  if (flagEl) flagEl.textContent = langFlags[lang];
  if (codeEl) codeEl.textContent = langNames[lang];
  
  // 更新选中状态
  document.querySelectorAll('.lang-option').forEach(option => {
    option.classList.toggle('active', option.getAttribute('data-lang') === lang);
  });
  
  // 更新 HTML lang 属性
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
}

// 切换语言
function switchLanguage(lang) {
  updatePageLanguage(lang);
  toggleLangDropdown();
}

// 切换下拉菜单
function toggleLangDropdown() {
  const dropdown = document.getElementById('lang-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

// 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.lang-switcher')) {
    const dropdown = document.getElementById('lang-dropdown');
    if (dropdown) {
      dropdown.classList.remove('show');
    }
  }
});

// 页面加载时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTranslations);
} else {
  loadTranslations();
}
