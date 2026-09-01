import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'

export default createVuetify({
  theme: {
    defaultTheme: 'clinicTheme',
    themes: {
      clinicTheme: {
        dark: false,
        colors: {
          primary: '#1976D2',
          secondary: '#26A69A',
          accent: '#FFC107',
          background: '#F5F5F5',
        },
      },
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})
