import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import zh from './zh'

const savedLang = localStorage.getItem('skillpilot:language') || 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export function changeLanguage(lang: string) {
  localStorage.setItem('skillpilot:language', lang)
  i18n.changeLanguage(lang)
}

export default i18n
