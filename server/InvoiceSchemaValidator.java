import java.nio.file.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.sax.SAXSource;
import javax.xml.validation.SchemaFactory;
import org.xml.sax.InputSource;

// Called only with server-owned schema paths and generated temporary documents.
class InvoiceSchemaValidator {
 public static void main(String[] args) throws Exception {
  var factory=SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
  factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
  // e-SLOG's trusted schema declares large repeating groups; request documents remain capped at 100 lines.
  factory.setProperty("http://www.oracle.com/xml/jaxp/properties/maxOccurLimit","0");
  factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD,"");
  factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"file");
  var schema=factory.newSchema(Path.of(args[0]).toFile());
  var parser=SAXParserFactory.newInstance();parser.setNamespaceAware(true);
  parser.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
  parser.setFeature("http://xml.org/sax/features/external-general-entities",false);
  parser.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
  var validator=schema.newValidator();
  validator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD,"");
  validator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
  try(var stream=Files.newInputStream(Path.of(args[1]))){
   validator.validate(new SAXSource(parser.newSAXParser().getXMLReader(),new InputSource(stream)));
  }
  System.out.println("XSD_VALID");
 }
}
