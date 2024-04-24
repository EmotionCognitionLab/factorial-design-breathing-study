import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

export class DatedCheckbox {
    
    constructor(key, dateStr=null) {
        this.key = key;
        if (dateStr) {
            this.date = dayjs(dateStr);
            this.displayDate = DatedCheckbox.formatDate(this.date);
            this.checked = true
        } else {
            this.date = null;
            this.checked = false;
        }
    }

    static formatDate(dateStr) {
        return dayjs(dateStr).format('YYYY-MM-DD');
    }

    // NB: Users of the class need to wire this up.
    // In order to prevent the creation of a click
    // handler for every single checkbox it is not
    // automatically connected to the onclick handler
    // of the checkbox.
    static handleClick(event) {
        const checkbox = event.target;
        const span = checkbox.labels[0]?.querySelector("span");
        const origDateStr = span.textContent;
        const key = checkbox.dataset.key;
        if (checkbox.checked) {
            // the box has just been checked; generate a date
            this.date = dayjs().tz('America/Los_Angeles');
            span.textContent = this.date.format('YYYY-MM-DD');
            return { key: key, date: this.date, origDateStr: origDateStr };
        }

        // the checkbox has just been unchecked; 
        // confirm this is desired and wipe the date
        if (window.confirm("Unset this timestamp?")) {
            span.textContent = "";
            return { key: key, date: null, origDateStr: origDateStr }
        }  
    }

    // If your event handler calls handleClick and then
    // experiences an error while doing something else
    // call this to undo the effects of handleClick
    static undoClick(event, origDateStr) {
        const checkbox = event.target;
        const span = checkbox.labels[0]?.querySelector("span");
        span.textContent = origDateStr;
        checkbox.checked = !checkbox.checked;
    }
}