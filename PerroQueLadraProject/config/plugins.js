module.exports = ({ env }) => ({
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: 'smtpout.secureserver.net', 
        port: 587, 
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
        },
        secure: true, 
        tls: {
          rejectUnauthorized: false, 
        },
      },
      settings: {
        defaultFrom: 'PERRO QUE LADRA <hola@perroqueladra.com.mx>',
        defaultReplyTo: 'hola@perroqueladra.com.mx',
      },
    },
  },
});