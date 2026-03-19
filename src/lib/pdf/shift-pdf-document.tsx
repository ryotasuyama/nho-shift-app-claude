import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const SHIFT_LABELS: Record<string, string> = {
  day: "日",
  evening: "準",
  night: "深",
  off: "休",
  holiday_off: "代",
  requested_off: "希",
};

const SHIFT_BG: Record<string, string> = {
  day: "#ffffff",
  evening: "#fff7ed",
  night: "#eff6ff",
  off: "#f3f4f6",
  holiday_off: "#faf5ff",
  requested_off: "#fdf2f8",
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type StaffInfo = {
  id: string;
  name: string;
  staff_code: string;
  team: string;
};

type EntryInfo = {
  staff_id: string;
  date: string;
  shift_type: string;
};

type ShiftPdfProps = {
  termStart: string;
  termEnd: string;
  staffs: StaffInfo[];
  entries: EntryInfo[];
  dates: string[];
  holidays: Set<string>;
};

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 7,
  },
  header: {
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: {
    fontSize: 8,
    color: "#6b7280",
  },
  table: {
    flexDirection: "column",
    border: "0.5pt solid #d1d5db",
  },
  row: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #d1d5db",
  },
  headerRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #d1d5db",
    backgroundColor: "#f3f4f6",
  },
  staffCell: {
    width: 70,
    padding: 2,
    borderRight: "0.5pt solid #d1d5db",
    fontFamily: "Helvetica-Bold",
  },
  dateCell: {
    width: 18,
    padding: 1,
    borderRight: "0.5pt solid #d1d5db",
    textAlign: "center",
    fontSize: 6,
  },
  sundayBg: {
    backgroundColor: "#fef2f2",
  },
  saturdayBg: {
    backgroundColor: "#eff6ff",
  },
  holidayBg: {
    backgroundColor: "#fdf2f8",
  },
  sundayText: {
    color: "#dc2626",
  },
  saturdayText: {
    color: "#2563eb",
  },
  footer: {
    position: "absolute",
    bottom: 15,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 7,
    color: "#9ca3af",
  },
  legend: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
    fontSize: 7,
    color: "#6b7280",
  },
  legendItem: {
    flexDirection: "row",
    gap: 2,
  },
});

export function createShiftPdfDocument(props: ShiftPdfProps) {
  const { termStart, termEnd, staffs, entries, dates, holidays } = props;

  const getDow = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getUTCDay();

  const getEntry = (staffId: string, date: string) =>
    entries.find((e) => e.staff_id === staffId && e.date === date);

  const getDateBgStyle = (dateStr: string) => {
    if (holidays.has(dateStr)) return styles.holidayBg;
    const dow = getDow(dateStr);
    if (dow === 0) return styles.sundayBg;
    if (dow === 6) return styles.saturdayBg;
    return {};
  };

  const getDateTextStyle = (dateStr: string) => {
    const dow = getDow(dateStr);
    if (dow === 0) return styles.sundayText;
    if (dow === 6) return styles.saturdayText;
    return {};
  };

  const now = new Date();
  const outputDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <Document>
      <Page size="A3" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>勤務表</Text>
            <Text style={styles.subtitle}>
              {termStart} 〜 {termEnd}
            </Text>
          </View>
          <Text style={styles.subtitle}>出力日時: {outputDate}</Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.staffCell}>
              <Text>スタッフ</Text>
            </View>
            {dates.map((date) => {
              const dow = getDow(date);
              const dayNum = date.slice(8);
              return (
                <View key={date} style={[styles.dateCell, getDateBgStyle(date)]}>
                  <Text style={getDateTextStyle(date)}>{dayNum}</Text>
                  <Text style={[{ fontSize: 5 }, getDateTextStyle(date)]}>{WEEKDAY_LABELS[dow]}</Text>
                </View>
              );
            })}
          </View>

          {/* Staff rows */}
          {staffs.map((staff) => (
            <View key={staff.id} style={styles.row}>
              <View style={styles.staffCell}>
                <Text>
                  {staff.staff_code} {staff.name}
                </Text>
              </View>
              {dates.map((date) => {
                const entry = getEntry(staff.id, date);
                const shiftType = entry?.shift_type ?? "";
                const cellBg = shiftType ? { backgroundColor: SHIFT_BG[shiftType] ?? "#ffffff" } : {};
                return (
                  <View key={date} style={[styles.dateCell, getDateBgStyle(date), cellBg]}>
                    <Text>{SHIFT_LABELS[shiftType] ?? ""}</Text>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Daily summary */}
          <View style={[styles.row, { backgroundColor: "#f3f4f6" }]}>
            <View style={styles.staffCell}>
              <Text>日/準/深</Text>
            </View>
            {dates.map((date) => {
              const dayEntries = entries.filter((e) => e.date === date);
              const d = dayEntries.filter((e) => e.shift_type === "day").length;
              const ev = dayEntries.filter((e) => e.shift_type === "evening").length;
              const n = dayEntries.filter((e) => e.shift_type === "night").length;
              return (
                <View key={date} style={[styles.dateCell, getDateBgStyle(date)]}>
                  <Text style={{ fontSize: 5 }}>
                    {d}/{ev}/{n}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Text>日=日勤</Text>
          </View>
          <View style={styles.legendItem}>
            <Text>準=準夜</Text>
          </View>
          <View style={styles.legendItem}>
            <Text>深=深夜</Text>
          </View>
          <View style={styles.legendItem}>
            <Text>休=週休</Text>
          </View>
          <View style={styles.legendItem}>
            <Text>代=代休</Text>
          </View>
          <View style={styles.legendItem}>
            <Text>希=希望休</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>1 / 1</Text>
      </Page>
    </Document>
  );
}
