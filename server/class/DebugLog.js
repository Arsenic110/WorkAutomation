const CColor = require("./ConsoleColors");

class DebugLog
{
    /**
     * Create a new instance of the DebugLog class.
     * @param {string} timestampColor Default color of the timestamp
     * @param {string} textColor Default color of the text
     */
    constructor(timestampColor, textColor)
    {
        this.setColors(timestampColor, textColor)

        this.lastTime = -1;
    }

    setColors(timestampColor, textColor)
    {
        if(timestampColor)
            this.timestampColor = timestampColor;
        else
            this.timestampColor = CColor.FgCyan;

        if(textColor)
            this.textColor = textColor;
        else
            this.textColor = CColor.Reset;
    }
    
    /**
     * Logs str in the console.
     * @param {string} str 
     */
    log(str)
    {
        let d = new Date();
        let msSinceLastLog = "";

        let msDifference = 0;

        if(this.lastTime != -1)
            msDifference = d.getTime() - this.lastTime;

        this.lastTime = d.getTime();
        msSinceLastLog = ` (${CColor.FgRed}${msDifference}${this.timestampColor})`;

        let time = `${this.timestampColor}[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${String(d.getMilliseconds()).padStart(3, '0')}${msSinceLastLog}]${this.textColor}`;
        console.log(time, str, CColor.Reset);
    }
}

module.exports = new DebugLog();