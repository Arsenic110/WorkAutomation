/* eslint-disable */

// ==UserScript==
// @name         SpeedPOD
// @namespace    DHL/SpeedPOD
// @version      1.3
// @description  This will copy POD details into a POD screenshot.
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let photoRow;

function main()
{
    //attempt to load
    photoRow = document.getElementsByClassName("col-md-12 table table-border")[0];

    console.log(photoRow);

    //check modules
    ncMedia();

}

function ncMedia()
{
    if(!photoRow)
        return;

    let tr = photoRow.children[0].children[0].children[1];
    let childrenRow = photoRow.children[0].children[0].children[0].children;

    //get time
    let timeArr = tr.children[1].innerHTML.toString().split(' ');
    let timeString = "";
    for(let i = 0; i < timeArr.length; i++)
    {
        if(timeArr[i].includes(':'))
        {
            timeString = timeArr[i];
        }
    }

    //add time to date
    tr.children[0].innerHTML = tr.children[0].innerHTML + " " + timeString;

    //set time to DN
    tr.children[1].innerHTML = document.getElementById('MainContent_psTrackMyParcel_LI_01_txtReferenceNo').value;

    console.log(tr.children[0].innerHTML);

    childrenRow[childrenRow.length - 1].innerHTML = "";
    childrenRow[childrenRow.length - 2].innerHTML = "DN";
}


window.onload(main, 1000);
main();
})();