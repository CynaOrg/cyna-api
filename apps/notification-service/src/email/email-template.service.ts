import { Injectable, OnModuleInit } from '@nestjs/common';
import { CynaLoggerService } from '@cyna-api/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

interface CompiledTemplates {
  [language: string]: {
    [templateName: string]: Handlebars.TemplateDelegate;
  };
}

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private templates: CompiledTemplates = {};
  private baseLayout: Handlebars.TemplateDelegate | null = null;

  constructor(private readonly logger: CynaLoggerService) {}

  async onModuleInit() {
    await this.loadTemplates();
  }

  private async loadTemplates(): Promise<void> {
    // Auto-detect templates directory (source or dist)
    const candidates = [
      path.join(process.cwd(), 'apps', 'notification-service', 'src', 'templates'),
      path.join(process.cwd(), 'dist', 'apps', 'notification-service', 'templates'),
    ];
    const templatesDir = candidates.find((p) => fs.existsSync(p)) || candidates[0];

    // Load base layout
    const layoutPath = path.join(templatesDir, 'layouts', 'base.hbs');
    if (fs.existsSync(layoutPath)) {
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
      this.baseLayout = Handlebars.compile(layoutContent);
      this.logger.log('Base layout loaded successfully', 'EmailTemplateService');
    } else {
      this.logger.warn(
        'Base layout not found, templates will render without layout',
        'EmailTemplateService',
      );
    }

    // Load language-specific templates
    const languages = ['fr', 'en'];
    for (const lang of languages) {
      this.templates[lang] = {};
      const langDir = path.join(templatesDir, lang);

      if (!fs.existsSync(langDir)) {
        this.logger.warn(
          `Template directory for language ${lang} not found`,
          'EmailTemplateService',
        );
        continue;
      }

      const templateFiles = fs.readdirSync(langDir).filter((f) => f.endsWith('.hbs'));

      for (const file of templateFiles) {
        const templateName = file.replace('.hbs', '');
        const templatePath = path.join(langDir, file);
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        this.templates[lang][templateName] = Handlebars.compile(templateContent);
        this.logger.log(`Template loaded: ${lang}/${templateName}`, 'EmailTemplateService');
      }
    }
  }

  render(
    templateName: string,
    language: 'fr' | 'en',
    variables: Record<string, string | number>,
  ): string {
    const lang = this.templates[language] ? language : 'fr';
    const template = this.templates[lang]?.[templateName];

    if (!template) {
      this.logger.error(
        `Template not found: ${templateName} for language ${lang}`,
        undefined,
        'EmailTemplateService',
      );
      throw new Error(`Template not found: ${templateName}`);
    }

    const content = template(variables);

    if (this.baseLayout) {
      return this.baseLayout({ content, ...variables });
    }

    return content;
  }
}
