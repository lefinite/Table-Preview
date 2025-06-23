import { bitable } from '@lark-base-open/js-sdk';
import i18next from 'i18next';
import $ from 'jquery';
import jqueryI18next from 'jquery-i18next';
import i18nextBrowserLanguageDetector from 'i18next-browser-languagedetector';
import zh from './zh'
import en from './en'

// 国际化配置，详情请看README.md
/** 语言方案 */
const resources = {
  en: {
    translation: en
  },
  zh: {
    translation: zh
  }
}


const rerender = () => {
  $('body').localize(); // localize 由jqueryI18next.init注入
}

$(function() {
  i18next
    .use(i18nextBrowserLanguageDetector)
    .init({
      debug: false,
      fallbackLng: 'zh',
      resources,
      detection: {
        order: ['navigator', 'htmlTag'],
        caches: ['localStorage']
      }
    }, (err) => {
      if (err) return console.error(err);
      jqueryI18next.init(i18next, $, { useOptionsAttr: true });
      
      // 尝试从飞书获取语言设置
      if (typeof bitable !== 'undefined' && bitable.bridge && bitable.bridge.getLanguage) {
        bitable.bridge.getLanguage().then((lang) => {
          // 将飞书的语言代码映射到我们的语言代码
          const langMap: Record<string, string> = {
            'zh-CN': 'zh',
            'zh-TW': 'zh',
            'zh-HK': 'zh',
            'en-US': 'en',
            'en-GB': 'en',
            'en': 'en',
            'zh': 'zh'
          };
          const mappedLang = langMap[lang] || (lang.startsWith('zh') ? 'zh' : 'en');
          i18next.changeLanguage(mappedLang, () => {
            rerender();
          });
        }).catch(() => {
          // 如果获取飞书语言失败，使用浏览器语言
          const browserLang = navigator.language;
          const defaultLang = browserLang.startsWith('zh') ? 'zh' : 'en';
          i18next.changeLanguage(defaultLang, () => {
            rerender();
          });
        });
      } else {
        // 如果不在飞书环境中，使用浏览器语言
        const browserLang = navigator.language;
        const defaultLang = browserLang.startsWith('zh') ? 'zh' : 'en';
        i18next.changeLanguage(defaultLang, () => {
          rerender();
        });
      }
    });
});