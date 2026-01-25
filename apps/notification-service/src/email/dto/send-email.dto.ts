export interface SendEmailDto {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface TemplateEmailDto {
  to: string;
  template: string;
  language: 'fr' | 'en';
  subject: string;
  variables: Record<string, string | number>;
}
