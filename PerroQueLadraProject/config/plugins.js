module.exports = ({ env }) => ({
  email: {
    config: {
      provider: 'nodemailer', // o '@strapi/provider-email-nodemailer'
      providerOptions: {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'ubaldo.hodkiewicz38@ethereal.email',
          pass: 'ffcHg4Kq6kRBRCp7s1',
        },
      },
      settings: {
        defaultFrom: 'PERRO QUE LADRA <noreply@perroqueladra.com>',
        defaultReplyTo: 'noreply@perroqueladra.com',
      },
    },
  },
});