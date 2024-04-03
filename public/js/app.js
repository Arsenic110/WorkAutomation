var socket;
var perSocketId;

var outputP;
var opsDiv, opData = [];

var dellCopyFloat = false;

document.documentElement.style.setProperty('--scrollbar-width', (window.innerWidth - document.documentElement.clientWidth) + "px");
document.documentElement.style.setProperty('--scrollbar-height', (window.innerHeight - document.documentElement.clientHeight) + "px");

init();

function init()
{

    //enable dragging on all 'drag' elements
    let dgbs = document.getElementsByClassName("drag");
    makeDraggable(dgbs);

    document.getElementById("comma").addEventListener("paste", commaCopyPaste)

    Array.prototype.forEach.call(dgbs, (d) =>
    {
        d.style.backgroundColor = "#171717";
        d.style.position = "fixed";
        d.style.zIndex = 999;

        d.style.margin = "1rem";
        d.style.border = "2px solid #373737";
        d.style.padding = "1rem";

        d.style.whiteSpace = "nowrap";
    });

    outputP = document.getElementById("console-p");
    opsDiv = document.getElementById("operations");

    socket = io.connect(window.location.href);
    socket.emit("hello", {"name": "GUI", "version": "0.1.5" });

    writeOut("Requesting handshake...");
    socket.emit("client-handshake");

    socket.on("connect", (res) => {perSocketId = socket.id;writeOut(`Connection Established with ${writeColor(socket.id, "#00FF00")}`)});
    socket.on("disconnect", (res) => {writeOut(`Connection Lost with ${writeColor(perSocketId, "#FF0000")}`)});

    socket.on("job-done", (res) => {writeReply(`Server ${writeColor("completed", "#00FF00")} task ${res}`)});

    socket.on("broadcast", (br) => {writeReply(br)});

    Array.from(opsDiv.children).forEach((child) => 
    {
        if(child.tagName.toLowerCase() != "button")
            return;

        opData.push({child : child, id : child.id});
    });

    opData.forEach((element) => 
    {
        element.child.addEventListener("click", function(){ socket.emit(element.id); writeOut(`Emitting ${element.id}`)});
    });

    document.getElementById("/api/con/lastscan").replaceWith(document.getElementById("/api/con/lastscan").cloneNode(true));
    document.getElementById("/api/con/lastscan").addEventListener("click", ()=>
    { 
        let cn = document.getElementById("con").value;
        if(cn.length < 14)
        {
            writeOut(`Con Wrong!`);
            return;
        }
        socket.emit("/api/con/lastscan", cn); 
        writeOut(`Emitting "/api/con/lastscan", ${cn}`);
    });

    document.getElementById("/api/con/lastscanbulk").replaceWith(document.getElementById("/api/con/lastscanbulk").cloneNode(true));
    document.getElementById("/api/con/lastscanbulk").addEventListener("click", ()=>
    { 
        let cn = document.getElementById("con").value;
        if(cn.length < 14)
        {
            writeOut(`Con Wrong!`);
            return;
        }
        socket.emit("/api/con/lastscanbulk", cn);
        writeOut(`Emitting "/api/con/lastscanbulk"`);
    });

    Array.prototype.forEach.call(document.getElementsByClassName("copy-link"), (e) => 
    {
        e.addEventListener("mousedown", (event) =>
        {
            copyToClip(e.getAttribute("aria-copy"));
        });
    });

}

function writeOut(str)
{
    //if(outputP.innerHTML != "")
    //    outputP.innerHTML += "<br>";
    outputP.innerHTML += `<p>&gt;${str}</p>`;
}

function writeReply(str)
{
    str = `<p style="text-align:right; margin:0.2rem;">${str}</p>`;   
    outputP.innerHTML += str;
}

function writeColor(str, col)
{
    return `<span style="color:${col};">${str}</span>`;
}

function clearConsole()
{
    outputP.innerHTML = "";
}

function toggleFloat()
{
    dellCopyFloat = !dellCopyFloat;
    if(dellCopyFloat)
        document.getElementById("datafloat").style.display = "inline";
    else
        document.getElementById("datafloat").style.display = "none";

    document.getElementById("datafloat").style.top = "0";
    document.getElementById("datafloat").style.left = "0";
}

function copyToClip(text)
{
    navigator.clipboard.writeText(text)
        .then(() => {console.log('Text copied to clipboard:', text);})
        .catch(err => {console.error('Error in copying text: ', err);});
}

function commaCopyPaste(e)
{
    let inputText;

    if(e)
    {
        var clipboardData
        e.stopPropagation();
        e.preventDefault();

        clipboardData = e.clipboardData || window.clipboardData;
        inputText = clipboardData.getData('Text');
    }
    else
    {
        inputText = document.getElementById("comma").value;
    }

    let text = inputText.split("\n");
    let outputText = "";

    text.forEach(t => {if(t.length > 1)outputText += t.replace(/(\r\n|\n|\r)/gm, "") + ", ";});
    outputText = outputText.substring(0, outputText.length - 2);

    //console.log("Pasted", outputText);
    document.getElementById("comma").value = outputText;
    copyToClip(outputText);
}

function sendDatalog()
{
    socket.emit("");
}