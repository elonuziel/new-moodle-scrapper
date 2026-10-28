import { CourseInfo } from '../types';

export const DEMO_COURSES: Record<string, CourseInfo> = {
  ruppin_cs101: {
    courseId: "1234",
    domain: "moodle.ruppin.ac.il",
    url: "https://moodle.ruppin.ac.il/course/view.php?id=1234",
    title: "10114 - מבוא למדעי המחשב ושפת C",
    userName: "אלון עוזיאל (Elon Uziel)",
    totalItems: 14,
    sections: [
      {
        id: "sec-0",
        name: "סילבוס והודעות כלליות (General & Syllabus)",
        safeName: "סילבוס והודעות כלליות (General & Syllabus)",
        selected: true,
        items: [
          {
            id: "act-1",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10101",
            title: "סילבוס הקורס ודרישות אקדמיות תשפ\"ו",
            modType: "resource",
            sectionName: "סילבוס והודעות כלליות (General & Syllabus)",
            selected: true,
            nestedFiles: [
              { name: "course_syllabus_2026.pdf", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10101", size: 419430 }
            ]
          },
          {
            id: "act-2",
            href: "https://moodle.ruppin.ac.il/mod/page/view.php?id=10102",
            title: "הנחיות התקנת סביבת פיתוח VSCode ו-GCC",
            modType: "page",
            sectionName: "סילבוס והודעות כלליות (General & Syllabus)",
            selected: true,
            nestedFiles: [
              { name: "vscode_gcc_setup_guide.pdf", url: "https://moodle.ruppin.ac.il/mod/page/view.php?id=10102", size: 1258291 }
            ]
          }
        ]
      },
      {
        id: "sec-1",
        name: "שבוע 01 - יסודות השפה, משתנים ותנאים",
        safeName: "שבוע 01 - יסודות השפה, משתנים ותנאים",
        selected: true,
        items: [
          {
            id: "act-3",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10201",
            title: "הרצאה 01 - מבוא לשפת C וטיפוסי נתונים",
            modType: "resource",
            sectionName: "שבוע 01 - יסודות השפה, משתנים ותנאים",
            selected: true,
            nestedFiles: [
              { name: "lecture01_intro_and_types.pptx", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10201", size: 3145728 }
            ]
          },
          {
            id: "act-4",
            href: "https://moodle.ruppin.ac.il/mod/folder/view.php?id=10202",
            title: "דוגמאות קוד כיתה - תרגיל 1",
            modType: "folder",
            sectionName: "שבוע 01 - יסודות השפה, משתנים ותנאים",
            selected: true,
            nestedFiles: [
              { name: "main.c", url: "https://moodle.ruppin.ac.il/code/main.c", size: 1024 },
              { name: "utils.h", url: "https://moodle.ruppin.ac.il/code/utils.h", size: 512 },
              { name: "calc.c", url: "https://moodle.ruppin.ac.il/code/calc.c", size: 2048 }
            ]
          },
          {
            id: "act-5",
            href: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10203",
            title: "מטלת בית 1 - תנאים וביטויים לוגיים",
            modType: "assign",
            sectionName: "שבוע 01 - יסודות השפה, משתנים ותנאים",
            selected: true,
            nestedFiles: [
              { name: "homework_assignment_1.pdf", url: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10203&file=hw1.pdf", size: 852400 },
              { name: "homework_1_starter_code.zip", url: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10203&file=code.zip", size: 245000 }
            ]
          }
        ]
      },
      {
        id: "sec-2",
        name: "שבוע 02 - לולאות ופונקציות (Loops & Functions)",
        safeName: "שבוע 02 - לולאות ופונקציות (Loops & Functions)",
        selected: true,
        items: [
          {
            id: "act-6",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10301",
            title: "הרצאה 02 - לולאות for, while ומבנה פונקציה",
            modType: "resource",
            sectionName: "שבוע 02 - לולאות ופונקציות (Loops & Functions)",
            selected: true,
            nestedFiles: [
              { name: "lecture02_loops_functions.pdf", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10301", size: 2845000 }
            ]
          },
          {
            id: "act-7",
            href: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10302",
            title: "מטלת בית 2 - מימוש אלגוריתמים בסיסיים",
            modType: "assign",
            sectionName: "שבוע 02 - לולאות ופונקציות (Loops & Functions)",
            selected: true,
            nestedFiles: [
              { name: "hw2_spec.pdf", url: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10302&f=1", size: 612000 },
              { name: "hw2_solution_sheet.pdf", url: "https://moodle.ruppin.ac.il/mod/assign/view.php?id=10302&f=2", size: 914000 }
            ]
          }
        ]
      },
      {
        id: "sec-3",
        name: "שבוע 03 - מערכים ומצביעים (Pointers & Memory)",
        safeName: "שבוע 03 - מערכים ומצביעים (Pointers & Memory)",
        selected: true,
        items: [
          {
            id: "act-8",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10401",
            title: "הרצאה 03 - כתובות זיכרון, מצביעים ומערכים חד-ממדיים",
            modType: "resource",
            sectionName: "שבוע 03 - מערכים ומצביעים (Pointers & Memory)",
            selected: true,
            nestedFiles: [
              { name: "lecture03_pointers_arrays.pptx", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10401", size: 4890000 }
            ]
          },
          {
            id: "act-9",
            href: "https://moodle.ruppin.ac.il/mod/folder/view.php?id=10402",
            title: "תרגיל מעבדה 3 - ניהול זיכרון ודיבאגינג",
            modType: "folder",
            sectionName: "שבוע 03 - מערכים ומצביעים (Pointers & Memory)",
            selected: true,
            nestedFiles: [
              { name: "lab3_exercises.pdf", url: "https://moodle.ruppin.ac.il/lab/lab3.pdf", size: 750000 },
              { name: "valgrind_cheatsheet.pdf", url: "https://moodle.ruppin.ac.il/lab/valgrind.pdf", size: 320000 }
            ]
          }
        ]
      },
      {
        id: "sec-4",
        name: "מבחנים לדוגמה ופתרונות (Exams & Solutions)",
        safeName: "מבחנים לדוגמה ופתרונות (Exams & Solutions)",
        selected: true,
        items: [
          {
            id: "act-10",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10501",
            title: "מבחן מועד א' תשפ\"ה - שאלון ופתרון רשמי מלא",
            modType: "resource",
            sectionName: "מבחנים לדוגמה ופתרונות (Exams & Solutions)",
            selected: true,
            nestedFiles: [
              { name: "exam_2025_moed_a_solved.pdf", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10501", size: 1850000 }
            ]
          },
          {
            id: "act-11",
            href: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10502",
            title: "מבחן מועד ב' תשפ\"ה - שאלון ופתרון רשמי מלא",
            modType: "resource",
            sectionName: "מבחנים לדוגמה ופתרונות (Exams & Solutions)",
            selected: true,
            nestedFiles: [
              { name: "exam_2025_moed_b_solved.pdf", url: "https://moodle.ruppin.ac.il/mod/resource/view.php?id=10502", size: 1720000 }
            ]
          }
        ]
      }
    ]
  }
};
