import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CynaLoggerService } from '@cyna-api/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SendEmailDto } from './dto/send-email.dto';

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {}

  async onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully', 'EmailService');
    } catch (error) {
      this.logger.error(
        `SMTP connection verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'EmailService',
      );
    }
  }

  async sendEmail(dto: SendEmailDto): Promise<boolean> {
    const fromName = this.configService.get<string>('SMTP_FROM_NAME', 'CYNA');
    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', 'noreply@cyna.io');

    try {
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: dto.to,
        subject: dto.subject,
        html: dto.html,
        text: dto.text,
      });

      this.logger.log(
        `Email sent successfully to ${dto.to}, messageId: ${result.messageId}`,
        'EmailService',
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${dto.to}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'EmailService',
      );
      return false;
    }
  }
}
