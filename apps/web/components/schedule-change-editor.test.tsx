import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import { isReplacementValid, ScheduleChangeEditor } from "./schedule-change-editor";
describe("schedule changes",()=>{
  it("requires a different replacement for every selected slot, including restored drafts",()=>{
    expect(isReplacementValid("",[{classTypeId:"yoga"}])).toBe(false);
    expect(isReplacementValid("yoga",[{classTypeId:"yoga"}])).toBe(false);
    expect(isReplacementValid("latino",[{classTypeId:"yoga"},{classTypeId:"latino"}])).toBe(false);
    expect(isReplacementValid("latino",[])).toBe(false);
    expect(isReplacementValid("latino",[{classTypeId:"yoga"},{classTypeId:"yoga"}])).toBe(true);
  });
  it("starts with a small capacity form for one slot and exposes explicit alternatives",()=>{
    const rule={id:"rule",classTypeId:"flow",className:"Balance Flow",instructorId:"nicol",instructorName:"Nicola",weekday:4,localStartTime:"17:00",durationMinutes:60,capacity:10,priceCents:16000,bookingLeadDays:30,active:true,generateFrom:"2026-10-29"};
    const html=renderToStaticMarkup(<ScheduleChangeEditor rule={rule} rules={[rule]} classTypes={[{id:"flow",name:"Balance Flow",active:true}]} instructors={[{id:"nicol",displayName:"Nicola",active:true}]} busy={false} onApplied={async()=>undefined}/>);
    expect(html).toContain("Jen čtvrtek v 17:00");expect(html).toContain("Platí od");expect(html).toContain('name="capacity"');
    expect(html).not.toContain('name="price"');expect(html).toContain("Uzavřít nové rezervace");expect(html).toContain("Zrušené rezervace");
  });
});
