import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';

const { Title, Paragraph } = Typography;

export default function Landing() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const features = [
    { title: t('landing.features.co.title'), desc: t('landing.features.co.desc') },
    { title: t('landing.features.ce.title'), desc: t('landing.features.ce.desc') },
    { title: t('landing.features.pe.title'), desc: t('landing.features.pe.desc') },
    { title: t('landing.features.po.title'), desc: t('landing.features.po.desc') },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center py-16">
        <Title level={1} style={{ color: '#1A3A5C', marginBottom: 8 }}>
          {t('landing.title')}
        </Title>
        <Paragraph className="text-lg text-gray-600 mb-8">{t('landing.subtitle')}</Paragraph>
        <div className="flex gap-3 justify-center">
          {user ? (
            <Link to="/research/new">
              <Button type="primary" size="large">{t('nav.newResearch')}</Button>
            </Link>
          ) : (
            <Link to="/register">
              <Button type="primary" size="large">{t('landing.ctaStart')}</Button>
            </Link>
          )}
          <Link to="/pricing">
            <Button size="large">{t('landing.ctaPricing')}</Button>
          </Link>
        </div>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        {features.map((f) => (
          <Col xs={24} sm={12} md={6} key={f.title}>
            <Card className="h-full text-center">
              <Title level={4}>{f.title}</Title>
              <Paragraph className="text-gray-500 mb-0">{f.desc}</Paragraph>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24}>
          <Link to={user ? '/research/new' : '/register'} className="block">
            <Card hoverable className="app-surface" style={{ borderColor: '#1677ff' }}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-5xl">⚙️</div>
                <div className="flex-1 min-w-[200px]">
                  <Title level={3} style={{ marginBottom: 4 }}>
                    {t('landing.mockTitle')}
                  </Title>
                  <Paragraph className="text-gray-500 mb-0">{t('landing.mockDesc')}</Paragraph>
                </div>
              </div>
            </Card>
          </Link>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-12">
        <Col xs={24}>
          <Link to={user ? '/projects' : '/register'}>
            <Card hoverable className="text-center" style={{ borderColor: '#1A3A5C' }}>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="text-5xl">📁</div>
                <div className="text-left">
                  <Title level={3} style={{ marginBottom: 4 }}>
                    {t('landing.myExamsTitle')}
                  </Title>
                  <Paragraph className="text-gray-500 mb-0">{t('landing.myExamsDesc')}</Paragraph>
                </div>
              </div>
            </Card>
          </Link>
        </Col>
      </Row>

    </div>
  );
}
