import { useMemo, useState } from 'react';
import { Button, Card, Col, InputNumber, Input, Row, Space, Statistic, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { saveCostInputs, type CostInputs } from '../../api/research';

const { Text } = Typography;

type Item = CostInputs['items'][number];

/**
 * 成本 & 回本测算面板(用户手动录入,USD)。
 * 月总成本、回本所需客户数前端实时算;点保存写入 cost_inputs。
 */
export default function CostPanel({ reportId, initial }: { reportId: string; initial: CostInputs | null }) {
  const [items, setItems] = useState<Item[]>(initial?.items ?? []);
  const [targetPrice, setTargetPrice] = useState<number | null>(initial?.targetPrice ?? null);
  const [saving, setSaving] = useState(false);

  const totalCost = useMemo(
    () => items.reduce((s, it) => s + (Number.isFinite(it.monthlyCost) ? it.monthlyCost : 0), 0),
    [items]
  );
  const breakEven = targetPrice && targetPrice > 0 ? Math.ceil(totalCost / targetPrice) : null;

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() { setItems((prev) => [...prev, { name: '', monthlyCost: 0 }]); }
  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  async function save() {
    setSaving(true);
    try {
      const payload: CostInputs = {
        items: items.filter((it) => it.name.trim()).map((it) => ({ name: it.name.trim(), monthlyCost: Math.max(0, it.monthlyCost || 0) })),
        targetPrice: targetPrice == null ? null : Math.max(0, targetPrice),
      };
      await saveCostInputs(reportId, payload);
      message.success('已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="成本 & 回本测算(手动 · USD)" extra={<Text type="secondary">你的私有假设</Text>}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {items.length === 0 && <Text type="secondary">还没有成本项 —— 添加研发、人力、获客、服务器等。</Text>}
        {items.map((it, i) => (
          <Row key={i} gutter={8} align="middle">
            <Col flex="auto">
              <Input
                placeholder="成本项(如 服务器)"
                value={it.name}
                maxLength={60}
                onChange={(e) => updateItem(i, { name: e.target.value })}
              />
            </Col>
            <Col>
              <InputNumber
                prefix="$"
                min={0}
                style={{ width: 140 }}
                value={it.monthlyCost}
                onChange={(v) => updateItem(i, { monthlyCost: Number(v) || 0 })}
                addonAfter="/月"
              />
            </Col>
            <Col>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(i)} />
            </Col>
          </Row>
        ))}
        <Button icon={<PlusOutlined />} onClick={addItem}>添加成本项</Button>

        <Row align="middle" gutter={8} style={{ marginTop: 12 }}>
          <Col><Text>计划售价</Text></Col>
          <Col>
            <InputNumber
              prefix="$"
              min={0}
              style={{ width: 160 }}
              value={targetPrice ?? undefined}
              onChange={(v) => setTargetPrice(v == null ? null : Number(v))}
              addonAfter="/月·客户"
            />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 12 }}>
          <Col xs={12} sm={8}>
            <Statistic title="月总成本" value={totalCost} prefix="$" />
          </Col>
          <Col xs={12} sm={8}>
            <Statistic title="计划售价" value={targetPrice && targetPrice > 0 ? targetPrice : '—'} prefix={targetPrice ? '$' : ''} suffix={targetPrice ? '/月' : ''} />
          </Col>
          <Col xs={12} sm={8}>
            <Statistic title="回本所需客户数" value={breakEven ?? '—'} />
          </Col>
        </Row>

        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Button type="primary" loading={saving} onClick={save}>保存</Button>
        </div>
      </Space>
    </Card>
  );
}
