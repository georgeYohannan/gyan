import { fireEvent, render, screen } from '@testing-library/react-native';

import DesignScreen from '@/app/(app)/design';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUSES, StatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { Colors, FontFamily, MinTouchTarget } from '@/constants/theme';

const flat = (node: { props: { style?: unknown } }) => Object.assign({}, ...[node.props.style].flat(5).filter(Boolean));

describe('Button', () => {
  test('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled and loading buttons do not fire', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Off" disabled onPress={onPress} />
        <Button label="Busy" loading onPress={onPress} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Busy' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  });

  test('is at least 44 points tall', async () => {
    await render(<Button label="Tall" />);
    const label = screen.getByText('Tall');
    const pill = label.parent!;
    expect(flat(pill).minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('record button uses the record color', async () => {
    await render(<Button label="Rec" variant="record" />);
    expect(flat(screen.getByText('Rec').parent!).backgroundColor).toBe(Colors.record);
  });
});

describe('Text', () => {
  test('Heading is white and uses the heading font', async () => {
    await render(<Heading>Hello</Heading>);
    const s = flat(screen.getByText('Hello'));
    expect(s.color).toBe(Colors.heading);
    expect(s.fontFamily).toBe(FontFamily.heading);
  });

  test('Body uses the body font and never brand blue', async () => {
    await render(<Body>Hi there</Body>);
    const s = flat(screen.getByText('Hi there'));
    expect(s.fontFamily).toBe(FontFamily.body);
    expect(s.color).not.toBe(Colors.brand);
  });
});

describe('GlassPanel', () => {
  test('has the glass fill and border', async () => {
    await render(<GlassPanel testID="g" />);
    const s = flat(screen.getByTestId('g'));
    expect(s.backgroundColor).toBe(Colors.glass);
    expect(s.borderColor).toBe(Colors.glassBorder);
  });
});

describe('TextField', () => {
  test('shows its label and an error message', async () => {
    await render(<TextField label="Email" error="Not an email" />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Not an email')).toBeTruthy();
  });

  test('disabled field cannot be edited', async () => {
    await render(<TextField label="Name" disabled />);
    expect(screen.getByLabelText('Name').props.editable).toBe(false);
  });
});

describe('StatusBadge', () => {
  test.each(STATUSES)('shows the word %s', async (status) => {
    await render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeTruthy();
  });
});

describe('Skeleton', () => {
  test('renders a loading placeholder', async () => {
    await render(<Skeleton />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('/design page', () => {
  test('shows every component and the help button', async () => {
    await render(<DesignScreen />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    for (const s of STATUSES) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    expect(screen.getByText('Primary disabled')).toBeTruthy();
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
  });
});
