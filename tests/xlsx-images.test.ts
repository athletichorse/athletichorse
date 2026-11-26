import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readCellImages, readDispImg, readDrawing, readRels, resolve, sheetImages } from "@/lib/xlsx-images";

describe("pictures in supplier sheets", () => {
  it("finds each picture's row in a real .xlsx (floating pictures)", async () => {
    const buf = readFileSync("tests/fixtures/proforma-pictures.xlsx");
    const imgs = await sheetImages(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(imgs.map((i) => [i.row, i.col, i.type])).toEqual([[3, 2, "image/png"], [4, 2, "image/png"]]);
    expect(imgs[0].bytes.slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47])); // "PNG"
  });
  it("reads Excel's prefixed drawing XML", () => {
    const rels = readRels('<Relationships><Relationship Id="rId1" Target="../media/image7.jpeg"/></Relationships>', "xl/drawings/drawing1.xml");
    expect(rels.get("rId1")).toBe("xl/media/image7.jpeg");
    const xml = '<xdr:wsDr><xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>1</xdr:colOff><xdr:row>9</xdr:row></xdr:from><xdr:pic><a:blip r:embed="rId1"/></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>';
    expect(readDrawing(xml, rels)).toEqual([{ row: 9, col: 2, path: "xl/media/image7.jpeg" }]);
    expect(resolve("xl/drawings/drawing1.xml", "/xl/media/a.png")).toBe("xl/media/a.png");
  });
  it("reads WPS pictures in cells (DISPIMG)", () => {
    const cells = readDispImg('<sheetData><row r="5"><c r="C5" t="str"><f>_xlfn.DISPIMG("ID_AB12",1)</f><v>=DISPIMG("ID_AB12",1)</v></c></row></sheetData>');
    expect(cells).toEqual([{ row: 4, col: 2, id: "ID_AB12" }]);
    const names = readCellImages('<etc:cellImages><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="ID_AB12"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId3"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>',
      readRels('<Relationships><Relationship Id="rId3" Target="media/image3.png"/></Relationships>', "xl/cellimages.xml"));
    expect(names.get("ID_AB12")).toBe("xl/media/image3.png");
  });
});
